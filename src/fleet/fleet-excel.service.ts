import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Truck } from './entities/truck.entity';
import { Trailer } from './entities/trailer.entity';
import { Fleet } from './entities/fleet.entity';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { TrailerStatus } from 'src/common/enums/trailerStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import {
  assertExportSize,
  boolCell,
  buildImportTemplate,
  buildXlsx,
  cell,
  dateCell,
  ExcelRow,
  ImportColumn,
  ImportResult,
  runExcelImport,
} from 'src/common/excel';

/**
 * Etiquetas de estado, idénticas a las del front (`useFleetStatus.ts`).
 *
 * Se usan en las dos direcciones: la exportación las escribe y la importación
 * las vuelve a leer, así que un Excel que bajó del sistema se puede corregir y
 * volver a subir sin traducir nada a mano.
 */
const TRUCK_STATUS_LABELS: Record<TruckStatus, string> = {
  [TruckStatus.AVAILABLE]: 'Disponible',
  [TruckStatus.ON_TRIP]: 'En viaje',
  [TruckStatus.STOPPED]: 'Detenido',
  [TruckStatus.WORKSHOP]: 'En taller',
  [TruckStatus.OUT_OF_SERVICE]: 'Fuera de servicio',
};

const TRAILER_STATUS_LABELS: Record<TrailerStatus, string> = {
  [TrailerStatus.AVAILABLE]: 'Disponible',
  [TrailerStatus.IN_USE]: 'En uso',
  [TrailerStatus.WORKSHOP]: 'En taller',
  [TrailerStatus.OUT_OF_SERVICE]: 'Fuera de servicio',
};

/** Filtros de la tabla de camiones; llegan tal cual desde el listado. */
export interface TruckExportFilters {
  search?: string;
  status?: TruckStatus;
  fleetId?: string;
}

export interface TrailerExportFilters {
  search?: string;
  status?: TrailerStatus;
}

export interface FleetExportFilters {
  search?: string;
}

/** Mapas de referencia cargados una sola vez por importación. */
interface FleetCtx {
  fleetIds: Map<string, string>;
}

@Injectable()
export class FleetExcelService {
  constructor(
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    @InjectRepository(Trailer)
    private readonly trailersRepository: Repository<Trailer>,
    @InjectRepository(Fleet)
    private readonly fleetsRepository: Repository<Fleet>,
  ) {}

  // ───────────────────────── Camiones ─────────────────────────

  private truckColumns(): ImportColumn<FleetCtx>[] {
    return [
      {
        header: 'Patente',
        field: 'plate',
        required: true,
        parse: cell.plate(),
        hint: 'Patente del camión. Es la que identifica la fila: si ya existe, se actualiza.',
        example: 'AB123CD',
      },
      {
        header: 'Nro interno',
        field: 'internalNumber',
        aliases: ['N° interno', 'Numero interno', 'Interno'],
        parse: cell.text(50),
        hint: 'Número con el que la empresa lo llama internamente.',
        example: '104',
      },
      {
        header: 'Marca',
        field: 'brand',
        parse: cell.text(80),
        example: 'Scania',
      },
      {
        header: 'Modelo',
        field: 'model',
        parse: cell.text(80),
        example: 'R450',
      },
      {
        header: 'Año',
        field: 'year',
        parse: cell.number({ int: true, min: 1900, max: 2100 }),
        example: '2021',
      },
      {
        header: 'Tipo',
        field: 'type',
        parse: cell.text(80),
        hint: 'Tractor, chasis, balancín, etc.',
        example: 'Tractor',
      },
      {
        header: 'Capacidad (kg)',
        field: 'loadCapacityKg',
        parse: cell.number({ int: true, min: 0 }),
        example: '30000',
      },
      {
        header: 'Odometro (km)',
        field: 'currentOdometerKm',
        aliases: ['Odómetro (km)', 'Kilometraje'],
        parse: cell.number({ int: true, min: 0 }),
        hint: 'Kilómetros actuales. En una actualización nunca baja: si el valor es menor al que ya tiene, se ignora.',
        example: '145000',
      },
      {
        header: 'Horas de motor',
        field: 'engineHours',
        parse: cell.number({ int: true, min: 0 }),
        example: '5200',
      },
      {
        header: 'Estado',
        field: 'status',
        parse: cell.enumLabel<TruckStatus>(TRUCK_STATUS_LABELS),
        hint: `Uno de: ${Object.values(TRUCK_STATUS_LABELS).join(', ')}. Vacío = Disponible.`,
        example: 'Disponible',
      },
      {
        header: 'Flota',
        field: 'fleetId',
        parse: cell.lookup<FleetCtx>((ctx) => ctx.fleetIds, 'la flota'),
        hint: 'Nombre o código de una flota ya cargada. Por eso conviene empezar por la solapa Flotas.',
        example: 'NORTE',
      },
    ];
  }

  /**
   * Índice de flotas por nombre y por código: en las planillas la gente pone
   * indistintamente uno u otro.
   */
  private async fleetCtx(): Promise<FleetCtx> {
    const fleets = await this.fleetsRepository.find();
    const fleetIds = cell.indexBy(
      fleets,
      (f) => f.code,
      (f) => f.id,
    );
    for (const [k, v] of cell.indexBy(
      fleets,
      (f) => f.name,
      (f) => f.id,
    )) {
      if (!fleetIds.has(k)) fleetIds.set(k, v);
    }
    return { fleetIds };
  }

  private truckWhere(filters: TruckExportFilters): FindOptionsWhere<Truck>[] {
    const base: FindOptionsWhere<Truck> = {
      ...(filters.status && { status: filters.status }),
      ...(filters.fleetId && { fleetId: filters.fleetId }),
    };
    if (!filters.search) return [base];
    // Mismos campos que busca el listado paginado, para que el Excel traiga
    // exactamente las filas que el usuario está viendo.
    return ['plate', 'internalNumber', 'brand', 'model'].map((field) => ({
      ...base,
      [field]: ILike(`%${filters.search}%`),
    }));
  }

  async exportTrucks(filters: TruckExportFilters): Promise<Buffer> {
    const where = this.truckWhere(filters);
    assertExportSize(await this.trucksRepository.count({ where }));

    const trucks = await this.trucksRepository.find({
      where,
      relations: ['fleet'],
      order: { plate: 'ASC' },
    });

    const columns = [
      'Patente',
      'Nro interno',
      'Marca',
      'Modelo',
      'Año',
      'Tipo',
      'Capacidad (kg)',
      'Odometro (km)',
      'Horas de motor',
      'Estado',
      'Flota',
      'Alta',
    ];

    const rows: ExcelRow[] = trucks.map((t) => ({
      Patente: t.plate,
      'Nro interno': t.internalNumber ?? '',
      Marca: t.brand ?? '',
      Modelo: t.model ?? '',
      Año: t.year ?? '',
      Tipo: t.type ?? '',
      'Capacidad (kg)': t.loadCapacityKg ?? '',
      'Odometro (km)': t.currentOdometerKm ?? 0,
      'Horas de motor': t.engineHours ?? 0,
      Estado: TRUCK_STATUS_LABELS[t.status] ?? t.status,
      Flota: t.fleet?.name ?? '',
      Alta: dateCell(t.createdAt),
    }));

    return buildXlsx('Camiones', columns, rows);
  }

  truckTemplate(): Buffer {
    return buildImportTemplate('Camiones', this.truckColumns());
  }

  async importTrucks(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    return runExcelImport<Partial<Truck>, FleetCtx>({
      buffer,
      dryRun,
      columns: this.truckColumns(),
      ctx: await this.fleetCtx(),
      key: (row) => row.plate,
      find: (plate) => this.trucksRepository.findOne({ where: { plate } }),
      create: (row) =>
        this.trucksRepository.save(
          this.trucksRepository.create({
            status: TruckStatus.AVAILABLE,
            currentOdometerKm: 0,
            engineHours: 0,
            ...row,
            createdBy: user.id,
          }),
        ),
      update: (existing: Truck, row) => {
        // El odómetro sólo avanza: una planilla vieja no puede hacerle perder
        // kilómetros a una unidad y desarmar los planes de mantenimiento.
        const { currentOdometerKm, ...resto } = row;
        Object.assign(existing, resto, { updatedBy: user.id });
        if (
          currentOdometerKm !== undefined &&
          currentOdometerKm > existing.currentOdometerKm
        ) {
          existing.currentOdometerKm = currentOdometerKm;
        }
        return this.trucksRepository.save(existing);
      },
    });
  }

  // ───────────────────────── Acoplados ─────────────────────────

  private trailerColumns(): ImportColumn[] {
    return [
      {
        header: 'Patente',
        field: 'plate',
        required: true,
        parse: cell.plate(),
        hint: 'Patente del acoplado. Identifica la fila: si ya existe, se actualiza.',
        example: 'AA123BB',
      },
      {
        header: 'Tipo',
        field: 'type',
        parse: cell.text(80),
        hint: 'Semirremolque, batea, tanque, etc.',
        example: 'Semirremolque',
      },
      {
        header: 'Capacidad (kg)',
        field: 'loadCapacityKg',
        parse: cell.number({ int: true, min: 0 }),
        example: '28000',
      },
      {
        header: 'Estado',
        field: 'status',
        parse: cell.enumLabel<TrailerStatus>(TRAILER_STATUS_LABELS),
        hint: `Uno de: ${Object.values(TRAILER_STATUS_LABELS).join(', ')}. Vacío = Disponible.`,
        example: 'Disponible',
      },
      {
        header: 'Activo',
        field: 'isActive',
        parse: cell.bool(),
        hint: 'Sí o No. Vacío = Sí.',
        example: 'Sí',
      },
    ];
  }

  private trailerWhere(
    filters: TrailerExportFilters,
  ): FindOptionsWhere<Trailer>[] {
    const base: FindOptionsWhere<Trailer> = {
      ...(filters.status && { status: filters.status }),
    };
    if (!filters.search) return [base];
    return ['plate', 'type'].map((field) => ({
      ...base,
      [field]: ILike(`%${filters.search}%`),
    }));
  }

  async exportTrailers(filters: TrailerExportFilters): Promise<Buffer> {
    const where = this.trailerWhere(filters);
    assertExportSize(await this.trailersRepository.count({ where }));

    const trailers = await this.trailersRepository.find({
      where,
      order: { plate: 'ASC' },
    });

    const columns = [
      'Patente',
      'Tipo',
      'Capacidad (kg)',
      'Estado',
      'Activo',
      'Alta',
    ];

    const rows: ExcelRow[] = trailers.map((t) => ({
      Patente: t.plate,
      Tipo: t.type ?? '',
      'Capacidad (kg)': t.loadCapacityKg ?? '',
      Estado: TRAILER_STATUS_LABELS[t.status] ?? t.status,
      Activo: boolCell(t.isActive),
      Alta: dateCell(t.createdAt),
    }));

    return buildXlsx('Acoplados', columns, rows);
  }

  trailerTemplate(): Buffer {
    return buildImportTemplate('Acoplados', this.trailerColumns());
  }

  async importTrailers(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    return runExcelImport<Partial<Trailer>>({
      buffer,
      dryRun,
      columns: this.trailerColumns(),
      key: (row) => row.plate,
      find: (plate) => this.trailersRepository.findOne({ where: { plate } }),
      create: (row) =>
        this.trailersRepository.save(
          this.trailersRepository.create({
            status: TrailerStatus.AVAILABLE,
            isActive: true,
            ...row,
            createdBy: user.id,
          }),
        ),
      update: (existing: Trailer, row) =>
        this.trailersRepository.save(
          Object.assign(existing, row, { updatedBy: user.id }),
        ),
    });
  }

  // ───────────────────────── Flotas ─────────────────────────

  private fleetColumns(): ImportColumn[] {
    return [
      {
        header: 'Codigo',
        field: 'code',
        aliases: ['Código'],
        required: true,
        parse: cell.text(50),
        hint: 'Código corto y único de la flota. Identifica la fila: si ya existe, se actualiza.',
        example: 'NORTE',
      },
      {
        header: 'Nombre',
        field: 'name',
        required: true,
        parse: cell.text(120),
        example: 'Flota Norte',
      },
      {
        header: 'Notas',
        field: 'notes',
        parse: cell.text(500),
        example: 'Unidades de larga distancia',
      },
      {
        header: 'Activa',
        field: 'isActive',
        parse: cell.bool(),
        hint: 'Sí o No. Vacío = Sí.',
        example: 'Sí',
      },
    ];
  }

  private fleetWhere(filters: FleetExportFilters): FindOptionsWhere<Fleet>[] {
    if (!filters.search) return [{}];
    return ['name', 'code'].map((field) => ({
      [field]: ILike(`%${filters.search}%`),
    }));
  }

  async exportFleets(filters: FleetExportFilters): Promise<Buffer> {
    const where = this.fleetWhere(filters);
    assertExportSize(await this.fleetsRepository.count({ where }));

    const fleets = await this.fleetsRepository.find({
      where,
      relations: ['trucks'],
      order: { code: 'ASC' },
    });

    const columns = ['Codigo', 'Nombre', 'Camiones', 'Notas', 'Activa', 'Alta'];

    const rows: ExcelRow[] = fleets.map((f) => ({
      Codigo: f.code,
      Nombre: f.name,
      Camiones: f.trucks?.length ?? 0,
      Notas: f.notes ?? '',
      Activa: boolCell(f.isActive),
      Alta: dateCell(f.createdAt),
    }));

    return buildXlsx('Flotas', columns, rows);
  }

  fleetTemplate(): Buffer {
    return buildImportTemplate('Flotas', this.fleetColumns());
  }

  async importFleets(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    return runExcelImport<Partial<Fleet>>({
      buffer,
      dryRun,
      columns: this.fleetColumns(),
      key: (row) => row.code,
      find: (code) => this.fleetsRepository.findOne({ where: { code } }),
      create: (row) =>
        this.fleetsRepository.save(
          this.fleetsRepository.create({
            isActive: true,
            ...row,
            createdBy: user.id,
          }),
        ),
      update: (existing: Fleet, row) =>
        this.fleetsRepository.save(
          Object.assign(existing, row, { updatedBy: user.id }),
        ),
    });
  }
}
