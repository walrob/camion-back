import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import * as XLSX from 'xlsx';
import { FuelRecord } from './entities/fuel-record.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { CreateFuelRecordDto } from './dto/create-fuel-record.dto';
import { UpdateFuelRecordDto } from './dto/update-fuel-record.dto';
import { FuelFilterDto } from './dto/fuel-filter.dto';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { DriversService } from 'src/drivers/drivers.service';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';

// Rendimiento calculado por tramos entre cargas con tanque lleno.
interface Efficiency {
  distanceKm: number;
  litersPer100Km: number | null;
  kmPerLiter: number | null;
  costPerKm: number | null;
}

// Tramo entre dos cargas consecutivas con tanque lleno del mismo camión.
interface Segment {
  truckId: string;
  driverId: string | null;
  distanceKm: number;
  consumedLiters: number;
  cost: number;
}

export interface TruckConsumption extends Efficiency {
  truckId: string;
  plate: string;
  loads: number;
  totalLiters: number;
  totalCost: number;
  avgPricePerLiter: number;
  avgLitersPerLoad: number;
  avgCostPerLoad: number;
  avgKmBetweenLoads: number | null;
  avgDaysBetweenLoads: number | null;
  lastLoadAt: Date | null;
  lastOdometerKm: number | null;
}

export interface DriverConsumption extends Efficiency {
  driverId: string;
  driver: string;
  loads: number;
  totalLiters: number;
  totalCost: number;
  avgPricePerLiter: number;
  avgLitersPerLoad: number;
  avgCostPerLoad: number;
}

@Injectable()
export class FuelService {
  constructor(
    @InjectRepository(FuelRecord)
    private readonly fuelRepository: Repository<FuelRecord>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    private readonly driversService: DriversService,
  ) {}

  async create(
    dto: CreateFuelRecordDto,
    user: ActiveUserInterface,
  ): Promise<FuelRecord> {
    // Idempotencia para sync offline.
    if (dto.clientId) {
      const existing = await this.fuelRepository.findOne({
        where: { clientId: dto.clientId },
      });
      if (existing) return existing;
    }

    const truck = await this.trucksRepository.findOne({
      where: { id: dto.truckId },
    });
    if (!truck) throw new NotFoundException('Camión no encontrado.');

    // Si lo carga un chofer, se fuerza su propio perfil.
    let driverId = dto.driverId;
    if (user.role === Role.DRIVER) {
      const driver = await this.driversService.findByUserId(user.id);
      driverId = driver.id;
    }

    const totalAmount =
      dto.totalAmount ??
      (dto.pricePerLiter != null ? dto.pricePerLiter * dto.liters : 0);

    const record = this.fuelRepository.create({
      ...dto,
      driverId,
      totalAmount,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      createdBy: user.id,
    });
    return this.fuelRepository.save(record);
  }

  paginate(
    options: IPaginationOptions,
    filter: FuelFilterDto,
  ): Promise<Pagination<FuelRecord>> {
    return paginateAndSearch<FuelRecord>(this.fuelRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      searchFields: [],
      orderBy: 'occurredAt',
      order: 'DESC',
      dateField: 'occurredAt',
      from: filter.from,
      to: filter.to,
      relations: ['truck', 'driver', 'driver.employee'],
      baseWhere: {
        ...(filter.truckId && { truckId: filter.truckId }),
        ...(filter.driverId && { driverId: filter.driverId }),
      },
    });
  }

  async listMine(userId: string): Promise<FuelRecord[]> {
    const driver = await this.driversService.findByUserId(userId);
    return this.fuelRepository.find({
      where: { driverId: driver.id },
      relations: ['truck'],
      order: { occurredAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<FuelRecord> {
    const record = await this.fuelRepository.findOne({
      where: { id },
      relations: ['truck', 'driver', 'driver.employee'],
    });
    if (!record) throw new NotFoundException('Carga de combustible no encontrada.');
    return record;
  }

  async update(
    id: string,
    dto: UpdateFuelRecordDto,
    user: ActiveUserInterface,
  ): Promise<FuelRecord> {
    const record = await this.findOne(id);
    await this.assertEditable(record, user);
    Object.assign(record, dto, { updatedBy: user.id });
    if (dto.totalAmount == null && dto.pricePerLiter != null) {
      record.totalAmount = dto.pricePerLiter * Number(record.liters);
    }
    return this.fuelRepository.save(record);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const record = await this.findOne(id);
    await this.assertEditable(record, user);
    record.deletedBy = user.id;
    await this.fuelRepository.save(record);
    return this.fuelRepository.softDelete(id);
  }

  // ───────── Reportes ─────────

  private filterQuery(f: FuelFilterDto): SelectQueryBuilder<FuelRecord> {
    const qb = this.fuelRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.truck', 'truck')
      .leftJoinAndSelect('r.driver', 'd')
      .leftJoinAndSelect('d.employee', 'emp');
    if (f.truckId) qb.andWhere('r.truckId = :truckId', { truckId: f.truckId });
    if (f.driverId) qb.andWhere('r.driverId = :driverId', { driverId: f.driverId });
    if (f.fleetId) qb.andWhere('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    if (f.from) qb.andWhere('r.occurredAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('r.occurredAt <= :to', { to: f.to });
    return qb.orderBy('r.occurredAt', 'ASC');
  }

  /**
   * Construye los tramos entre cargas consecutivas con tanque lleno de un mismo
   * camión (método tanque-lleno). Los litros cargados dentro del tramo recorren
   * la distancia entre ambos odómetros; el tramo se atribuye al chofer que lo
   * cerró (quien condujo y volvió a cargar).
   */
  private buildSegments(truckRecords: FuelRecord[]): Segment[] {
    const withOdo = truckRecords
      .filter((r) => r.odometerKm != null)
      .sort((a, b) => a.odometerKm - b.odometerKm);
    const anchors = withOdo.filter((r) => r.fullTank);

    const segments: Segment[] = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      const distanceKm = b.odometerKm - a.odometerKm;
      if (distanceKm <= 0) continue;

      // Litros (y costo) cargados dentro del tramo, incluida la carga de cierre.
      const inSeg = withOdo.filter(
        (r) => r.odometerKm > a.odometerKm && r.odometerKm <= b.odometerKm,
      );
      segments.push({
        truckId: b.truckId,
        driverId: b.driverId ?? null,
        distanceKm,
        consumedLiters: inSeg.reduce((s, r) => s + Number(r.liters), 0),
        cost: inSeg.reduce((s, r) => s + Number(r.totalAmount), 0),
      });
    }
    return segments;
  }

  /** Agrega rendimiento (l/100km, km/l, costo/km) a partir de los tramos. */
  private efficiency(segments: Segment[]): Efficiency {
    const distanceKm = segments.reduce((s, x) => s + x.distanceKm, 0);
    const consumed = segments.reduce((s, x) => s + x.consumedLiters, 0);
    const cost = segments.reduce((s, x) => s + x.cost, 0);
    return {
      distanceKm,
      litersPer100Km:
        distanceKm > 0 && consumed > 0
          ? Number(((consumed / distanceKm) * 100).toFixed(2))
          : null,
      kmPerLiter:
        consumed > 0 ? Number((distanceKm / consumed).toFixed(2)) : null,
      costPerKm: distanceKm > 0 ? Number((cost / distanceKm).toFixed(2)) : null,
    };
  }

  /** Cada cuánto carga: promedio de km y de días entre cargas del camión. */
  private frequency(truckRecords: FuelRecord[]): {
    avgKmBetweenLoads: number | null;
    avgDaysBetweenLoads: number | null;
  } {
    const byOdo = truckRecords
      .filter((r) => r.odometerKm != null)
      .sort((a, b) => a.odometerKm - b.odometerKm);
    const kmGaps: number[] = [];
    for (let i = 1; i < byOdo.length; i++) {
      const d = byOdo[i].odometerKm - byOdo[i - 1].odometerKm;
      if (d > 0) kmGaps.push(d);
    }

    const byDate = [...truckRecords].sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    const dayGaps: number[] = [];
    for (let i = 1; i < byDate.length; i++) {
      const d =
        (new Date(byDate[i].occurredAt).getTime() -
          new Date(byDate[i - 1].occurredAt).getTime()) /
        86_400_000;
      dayGaps.push(d);
    }

    const avg = (arr: number[]) =>
      arr.reduce((s, x) => s + x, 0) / arr.length;
    return {
      avgKmBetweenLoads: kmGaps.length ? Number(avg(kmGaps).toFixed(0)) : null,
      avgDaysBetweenLoads: dayGaps.length
        ? Number(avg(dayGaps).toFixed(1))
        : null,
    };
  }

  async report(f: FuelFilterDto) {
    const records = await this.filterQuery(f).getMany();

    // Agrupar por camión preservando el orden cronológico de la consulta.
    const truckGroups = new Map<string, FuelRecord[]>();
    for (const r of records) {
      const bucket = truckGroups.get(r.truckId) ?? [];
      bucket.push(r);
      truckGroups.set(r.truckId, bucket);
    }

    const allSegments: Segment[] = [];
    const byTruck: TruckConsumption[] = [];

    for (const [truckId, recs] of truckGroups) {
      const segments = this.buildSegments(recs);
      allSegments.push(...segments);

      const totalLiters = recs.reduce((s, r) => s + Number(r.liters), 0);
      const totalCost = recs.reduce((s, r) => s + Number(r.totalAmount), 0);
      const last = recs[recs.length - 1]; // recs vienen en orden ascendente.

      byTruck.push({
        truckId,
        plate: recs[0].truck?.plate ?? '-',
        loads: recs.length,
        totalLiters: Number(totalLiters.toFixed(2)),
        totalCost: Number(totalCost.toFixed(2)),
        avgPricePerLiter:
          totalLiters > 0 ? Number((totalCost / totalLiters).toFixed(2)) : 0,
        avgLitersPerLoad: Number((totalLiters / recs.length).toFixed(2)),
        avgCostPerLoad: Number((totalCost / recs.length).toFixed(2)),
        ...this.frequency(recs),
        lastLoadAt: last.occurredAt ?? null,
        lastOdometerKm: last.odometerKm ?? null,
        ...this.efficiency(segments),
      });
    }
    byTruck.sort((a, b) => b.totalCost - a.totalCost);

    // Por chofer: totales con todas sus cargas, rendimiento con sus tramos.
    const driverTotals = new Map<
      string,
      { driver: string; totalLiters: number; totalCost: number; loads: number }
    >();
    for (const r of records) {
      if (!r.driverId) continue;
      const t = driverTotals.get(r.driverId) ?? {
        driver: r.driver?.employee
          ? `${r.driver.employee.firstName} ${r.driver.employee.lastName}`
          : '-',
        totalLiters: 0,
        totalCost: 0,
        loads: 0,
      };
      t.totalLiters += Number(r.liters);
      t.totalCost += Number(r.totalAmount);
      t.loads += 1;
      driverTotals.set(r.driverId, t);
    }

    const driverSegments = new Map<string, Segment[]>();
    for (const s of allSegments) {
      if (!s.driverId) continue;
      const arr = driverSegments.get(s.driverId) ?? [];
      arr.push(s);
      driverSegments.set(s.driverId, arr);
    }

    const byDriver: DriverConsumption[] = [...driverTotals.entries()]
      .map(([driverId, t]) => ({
        driverId,
        driver: t.driver,
        loads: t.loads,
        totalLiters: Number(t.totalLiters.toFixed(2)),
        totalCost: Number(t.totalCost.toFixed(2)),
        avgPricePerLiter:
          t.totalLiters > 0
            ? Number((t.totalCost / t.totalLiters).toFixed(2))
            : 0,
        avgLitersPerLoad: Number((t.totalLiters / t.loads).toFixed(2)),
        avgCostPerLoad: Number((t.totalCost / t.loads).toFixed(2)),
        ...this.efficiency(driverSegments.get(driverId) ?? []),
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const totalLiters = records.reduce((s, r) => s + Number(r.liters), 0);
    const totalCost = records.reduce((s, r) => s + Number(r.totalAmount), 0);
    const fleet = this.efficiency(allSegments);

    return {
      totalLiters: Number(totalLiters.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      loads: records.length,
      avgPricePerLiter:
        totalLiters > 0 ? Number((totalCost / totalLiters).toFixed(2)) : 0,
      totalDistanceKm: fleet.distanceKm,
      fleetKmPerLiter: fleet.kmPerLiter,
      fleetLitersPer100Km: fleet.litersPer100Km,
      fleetCostPerKm: fleet.costPerKm,
      byTruck,
      byDriver,
    };
  }

  async exportXlsx(f: FuelFilterDto): Promise<Buffer> {
    const r = await this.report(f);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { Indicador: 'Litros totales', Valor: r.totalLiters },
        { Indicador: 'Costo total', Valor: r.totalCost },
        { Indicador: 'Cargas', Valor: r.loads },
        { Indicador: 'Precio promedio por litro', Valor: r.avgPricePerLiter },
        { Indicador: 'Km recorridos', Valor: r.totalDistanceKm },
        { Indicador: 'Rendimiento (km/l)', Valor: r.fleetKmPerLiter ?? 's/d' },
        { Indicador: 'Consumo (l/100km)', Valor: r.fleetLitersPer100Km ?? 's/d' },
        { Indicador: 'Costo por km', Valor: r.fleetCostPerKm ?? 's/d' },
      ]),
      'Resumen',
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        r.byTruck.map((t) => ({
          Camion: t.plate,
          Cargas: t.loads,
          Litros: t.totalLiters,
          Costo: t.totalCost,
          'Km recorridos': t.distanceKm,
          'Rendimiento (km/l)': t.kmPerLiter ?? 's/d',
          'Consumo (l/100km)': t.litersPer100Km ?? 's/d',
          'Costo por km': t.costPerKm ?? 's/d',
          'Precio prom. litro': t.avgPricePerLiter,
          'Litros prom. x carga': t.avgLitersPerLoad,
          'Costo prom. x carga': t.avgCostPerLoad,
          'Km prom. entre cargas': t.avgKmBetweenLoads ?? 's/d',
          'Días prom. entre cargas': t.avgDaysBetweenLoads ?? 's/d',
        })),
      ),
      'Por camión',
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        r.byDriver.map((d) => ({
          Chofer: d.driver,
          Cargas: d.loads,
          Litros: d.totalLiters,
          Costo: d.totalCost,
          'Km recorridos': d.distanceKm,
          'Rendimiento (km/l)': d.kmPerLiter ?? 's/d',
          'Consumo (l/100km)': d.litersPer100Km ?? 's/d',
          'Costo por km': d.costPerKm ?? 's/d',
          'Precio prom. litro': d.avgPricePerLiter,
          'Litros prom. x carga': d.avgLitersPerLoad,
          'Costo prom. x carga': d.avgCostPerLoad,
        })),
      ),
      'Por chofer',
    );

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  private async assertEditable(record: FuelRecord, user: ActiveUserInterface) {
    if (user.role !== Role.DRIVER) return;
    const driver = await this.driversService.findByUserId(user.id);
    if (record.driverId !== driver.id) {
      throw new ForbiddenException('Esta carga no corresponde a su perfil.');
    }
  }
}
