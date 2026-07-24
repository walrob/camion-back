import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import * as XLSX from 'xlsx';
import {
  PdfReport,
  dateOnly,
  dateTime,
  number as num,
} from 'src/common/pdf/pdf-report.util';
import { Trip } from './entities/trip.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { FinishTripDto } from './dto/finish-trip.dto';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';
import { resolveSort } from 'src/common/utils/resolve-sort.util';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { TrucksService } from 'src/fleet/trucks.service';
import { DriversService } from 'src/drivers/drivers.service';
import { ChecklistsService } from 'src/checklists/checklists.service';
import { EmploymentMovementsService } from 'src/hr/employment-movements.service';
import { AlertsService } from 'src/alerts/alerts.service';

/** Normaliza una fecha a 'YYYY-MM-DD', que es como se guardan las del legajo. */
const toDateStr = (value: string | Date | undefined): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

/** Día anterior a una fecha 'YYYY-MM-DD'. */
const previousDay = (date: string): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return toDateStr(d)!;
};

const TRIP_STATUS_LABELS: Record<string, string> = {
  [TripStatus.ASSIGNED]: 'Asignado',
  [TripStatus.IN_PROGRESS]: 'En curso',
  [TripStatus.FINISHED]: 'Finalizado',
  [TripStatus.CANCELED]: 'Cancelado',
};

// Columnas por las que se permite ordenar (clave del front → columna/alias real).
const TRIP_SORTABLE: Record<string, string> = {
  code: 'code',
  origin: 'origin',
  destination: 'destination',
  'truck.plate': 'truck.plate',
  status: 'status',
  plannedStartAt: 'plannedStartAt',
  createdAt: 'createdAt',
};

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    private readonly trucksService: TrucksService,
    private readonly driversService: DriversService,
    private readonly checklistsService: ChecklistsService,
    private readonly movementsService: EmploymentMovementsService,
    private readonly alertsService: AlertsService,
  ) {}

  async create(dto: CreateTripDto, user: ActiveUserInterface): Promise<Trip> {
    const { closeLeave, ...tripData } = dto;
    await this.assertDriverAvailable(
      dto.driverId,
      dto.plannedStartAt,
      closeLeave,
      user,
    );

    const trip = this.tripsRepository.create({
      ...tripData,
      code: await this.generateCode(),
      createdBy: user.id,
    });
    return this.tripsRepository.save(trip);
  }

  paginate(
    options: IPaginationOptions,
    filters: {
      search?: string;
      status?: TripStatus;
      truckId?: string;
      driverId?: string;
      from?: string;
      to?: string;
      sortBy?: string;
      order?: string;
    },
  ): Promise<Pagination<Trip>> {
    const { orderBy, order } = resolveSort(
      filters.sortBy,
      filters.order,
      TRIP_SORTABLE,
      { orderBy: 'plannedStartAt', order: 'DESC' },
    );
    return paginateAndSearch<Trip>(this.tripsRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search: filters.search,
      searchFields: ['code', 'origin', 'destination'],
      orderBy,
      order,
      dateField: 'plannedStartAt',
      from: filters.from,
      // Fin de día para que el rango incluya los viajes creados en la fecha `to`.
      to: filters.to ? `${filters.to} 23:59:59.999` : undefined,
      relations: ['truck', 'driver', 'driver.employee', 'trailer'],
      baseWhere: {
        ...(filters.status && { status: filters.status }),
        ...(filters.truckId && { truckId: filters.truckId }),
        ...(filters.driverId && { driverId: filters.driverId }),
      },
    });
  }

  async findOne(id: string): Promise<Trip> {
    const trip = await this.tripsRepository.findOne({
      where: { id },
      relations: ['truck', 'driver', 'driver.employee', 'trailer'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    return trip;
  }

  // ───────── Exportaciones ─────────

  private driverName(trip: Trip): string {
    const emp = trip.driver?.employee;
    return emp ? `${emp.firstName} ${emp.lastName}` : '-';
  }

  /** Listado completo (sin paginar) que respeta los mismos filtros del listado. */
  private filteredTrips(filters: {
    search?: string;
    status?: TripStatus;
    truckId?: string;
    driverId?: string;
    from?: string;
    to?: string;
    sortBy?: string;
    order?: string;
  }): Promise<Trip[]> {
    const { orderBy, order } = resolveSort(
      filters.sortBy,
      filters.order,
      TRIP_SORTABLE,
      { orderBy: 'plannedStartAt', order: 'DESC' },
    );
    const qb = this.tripsRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('trip.trailer', 'trailer')
      .leftJoinAndSelect('trip.driver', 'driver')
      .leftJoinAndSelect('driver.employee', 'employee');

    if (filters.status) qb.andWhere('trip.status = :status', { status: filters.status });
    if (filters.truckId) qb.andWhere('trip.truckId = :truckId', { truckId: filters.truckId });
    if (filters.driverId) qb.andWhere('trip.driverId = :driverId', { driverId: filters.driverId });
    if (filters.from) qb.andWhere('trip.plannedStartAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('trip.plannedStartAt <= :to', { to: `${filters.to} 23:59:59.999` });
    if (filters.search) {
      qb.andWhere(
        '(LOWER(trip.code) LIKE LOWER(:s) OR LOWER(trip.origin) LIKE LOWER(:s) OR LOWER(trip.destination) LIKE LOWER(:s))',
        { s: `%${filters.search}%` },
      );
    }
    return qb.orderBy(`trip.${orderBy}`, order as 'ASC' | 'DESC').getMany();
  }

  async exportXlsx(filters: {
    search?: string;
    status?: TripStatus;
    truckId?: string;
    driverId?: string;
    from?: string;
    to?: string;
    sortBy?: string;
    order?: string;
  }): Promise<Buffer> {
    const trips = await this.filteredTrips(filters);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        trips.map((t) => ({
          Codigo: t.code,
          Estado: TRIP_STATUS_LABELS[t.status] ?? t.status,
          Origen: t.origin,
          Destino: t.destination,
          Camion: t.truck?.plate ?? '-',
          Acoplado: t.trailer?.plate ?? '-',
          Chofer: this.driverName(t),
          'Documento chofer': t.driver?.employee?.documentId ?? '-',
          'Salida planificada': dateTime(t.plannedStartAt),
          'Llegada planificada': dateTime(t.plannedEndAt),
          'Salida real': dateTime(t.startedAt),
          'Llegada real': dateTime(t.finishedAt),
          'Distancia (km)': t.distanceKm != null ? Number(t.distanceKm) : '',
          Carga: t.cargoDescription ?? '',
          Notas: t.notes ?? '',
        })),
      ),
      'Viajes',
    );
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /** Hoja de ruta imprimible del viaje (comprobante para el chofer). */
  async buildRouteSheetPdf(id: string): Promise<Buffer> {
    const trip = await this.findOne(id);
    const emp = trip.driver?.employee;
    const truck = trip.truck;
    const trailer = trip.trailer;

    const report = new PdfReport({
      title: 'Hoja de ruta',
      docId: trip.code,
      subtitle: `${trip.origin} → ${trip.destination}`,
      badge: {
        text: TRIP_STATUS_LABELS[trip.status] ?? trip.status,
        tone:
          trip.status === TripStatus.CANCELED
            ? 'warn'
            : trip.status === TripStatus.FINISHED
              ? 'ok'
              : 'neutral',
      },
      dataDateLabel: 'Salida planificada',
      dataDate: trip.plannedStartAt ?? null,
    });

    report.section('Datos del viaje', 0).fields([
      { label: 'Código', value: trip.code },
      { label: 'Estado', value: TRIP_STATUS_LABELS[trip.status] ?? trip.status },
      { label: 'Origen', value: trip.origin },
      { label: 'Destino', value: trip.destination },
      { label: 'Salida planificada', value: dateTime(trip.plannedStartAt) },
      { label: 'Llegada planificada', value: dateTime(trip.plannedEndAt) },
      { label: 'Salida real', value: dateTime(trip.startedAt) },
      { label: 'Llegada real', value: dateTime(trip.finishedAt) },
      { label: 'Carga', value: trip.cargoDescription },
    ]);

    report.section('Chofer y unidad').fields([
      { label: 'Chofer', value: this.driverName(trip) },
      { label: 'Documento', value: emp?.documentId },
      { label: 'Teléfono', value: emp?.phone },
      { label: 'Licencia N°', value: trip.driver?.licenseNumber },
      { label: 'Categoría', value: trip.driver?.licenseType },
      { label: 'Vencimiento licencia', value: dateOnly(trip.driver?.licenseExpiry) },
      {
        label: 'Camión',
        value: truck
          ? [truck.plate, truck.internalNumber && `(int. ${truck.internalNumber})`]
              .filter(Boolean)
              .join(' ')
          : '-',
      },
      {
        label: 'Marca / Modelo',
        value: truck ? [truck.brand, truck.model, truck.year].filter(Boolean).join(' ') : '-',
      },
      {
        label: 'Acoplado',
        value: trailer ? `${trailer.plate}${trailer.type ? ` - ${trailer.type}` : ''}` : '-',
      },
    ]);

    if (trip.notes) {
      report.section('Observaciones').paragraph(trip.notes, { muted: true });
    }

    report.signatures(['Firma del chofer', 'Despacho / Administración']);
    return report.finish();
  }

  async findMine(userId: string, status?: TripStatus): Promise<Trip[]> {
    const driver = await this.driversService.findByUserId(userId);
    return this.tripsRepository.find({
      where: { driverId: driver.id, ...(status && { status }) },
      relations: ['truck', 'trailer'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Detalle de un viaje propio del chofer (verifica pertenencia). */
  findOneForDriver(id: string, user: ActiveUserInterface): Promise<Trip> {
    return this.assertOwnedByDriver(id, user);
  }

  async update(
    id: string,
    dto: UpdateTripDto,
    user: ActiveUserInterface,
  ): Promise<Trip> {
    const trip = await this.findOne(id);
    if (trip.status !== TripStatus.ASSIGNED) {
      throw new BadRequestException(
        'Solo se puede editar un viaje en estado asignado.',
      );
    }

    const { closeLeave, ...tripData } = dto;
    // Revalidar solo si cambia el chofer o la fecha de inicio; el resto de los
    // campos no afecta la disponibilidad.
    if (dto.driverId || dto.plannedStartAt) {
      await this.assertDriverAvailable(
        dto.driverId ?? trip.driverId,
        dto.plannedStartAt ?? trip.plannedStartAt,
        closeLeave,
        user,
      );
    }

    Object.assign(trip, tripData, { updatedBy: user.id });
    return this.tripsRepository.save(trip);
  }

  /**
   * Un chofer no puede salir de viaje si su legajo no se lo permite en la fecha
   * de inicio prevista.
   *
   * - Baja y suspensión bloquean siempre: se resuelven en RRHH, no acá.
   * - La licencia bloquea salvo que venga `closeLeave`, que la finaliza el día
   *   anterior al viaje. En cualquier caso queda una alerta para RRHH.
   * - Si el viaje arranca después de que termina la licencia, se permite pero
   *   igual se avisa, porque hoy el chofer no está disponible.
   */
  private async assertDriverAvailable(
    driverId: string,
    plannedStartAt: string | Date | undefined,
    closeLeave: boolean | undefined,
    user: ActiveUserInterface,
  ): Promise<void> {
    const driver = await this.driversService.findOne(driverId);
    const employee = driver.employee;
    // Legajos viejos sin historial no bloquean nada.
    if (!employee) return;

    const startDate = toDateStr(plannedStartAt) ?? toDateStr(new Date())!;
    const name = `${employee.firstName} ${employee.lastName}`;
    const { status, movement } = await this.movementsService.statusAt(
      employee.id,
      startDate,
    );

    if (status === EmploymentStatus.TERMINATED) {
      throw new BadRequestException(
        `${name} está dado de baja${movement ? ` desde el ${movement.startDate}` : ''}. No se le pueden asignar viajes.`,
      );
    }

    if (status === EmploymentStatus.SUSPENDED) {
      const until = movement?.endDate
        ? `hasta el ${movement.endDate}`
        : 'sin fecha de fin';
      throw new BadRequestException(
        `${name} está suspendido ${until}. La suspensión debe levantarse desde RRHH antes de asignarle un viaje.`,
      );
    }

    if (status === EmploymentStatus.ON_LEAVE && movement) {
      const until = movement.endDate
        ? `hasta el ${movement.endDate}`
        : 'sin fecha de fin definida';

      if (!closeLeave) {
        throw new BadRequestException(
          `${name} está de licencia ${until}. Reprogramá el viaje para después de esa fecha o confirmá la finalización de la licencia.`,
        );
      }

      const closeDate = previousDay(startDate);
      if (closeDate < movement.startDate) {
        throw new BadRequestException(
          `La licencia de ${name} empieza el ${movement.startDate}, el mismo día del viaje o después. Si se cargó por error, eliminala desde RRHH.`,
        );
      }

      await this.movementsService.closeAt(movement.id, closeDate, user);
      await this.alertsService.createFromLeaveAssignment({
        employeeId: employee.id,
        employeeName: name,
        leaveUntil: movement.endDate,
        tripStart: startDate,
        closed: true,
      });
      return;
    }

    // El viaje arranca después de la licencia, pero hoy sigue sin estar
    // disponible: se permite y se avisa.
    const current = await this.movementsService.statusAt(employee.id);
    if (current.status === EmploymentStatus.ON_LEAVE && current.movement) {
      await this.alertsService.createFromLeaveAssignment({
        employeeId: employee.id,
        employeeName: name,
        leaveUntil: current.movement.endDate,
        tripStart: startDate,
        closed: false,
      });
    }
  }

  async start(
    id: string,
    dto: StartTripDto,
    user: ActiveUserInterface,
  ): Promise<Trip> {
    const trip = await this.assertOwnedByDriver(id, user);
    if (trip.status !== TripStatus.ASSIGNED) {
      throw new BadRequestException('El viaje ya fue iniciado o finalizado.');
    }

    const approved = await this.checklistsService.isApprovedForTrip(id);
    if (!approved) {
      throw new BadRequestException(
        'Debe completar y firmar el checklist pre-viaje antes de iniciar.',
      );
    }

    trip.status = TripStatus.IN_PROGRESS;
    trip.startedAt = new Date();
    trip.startOdometerKm = dto.startOdometerKm;
    trip.updatedBy = user.id;
    const saved = await this.tripsRepository.save(trip);

    await this.trucksService.update(
      trip.truckId,
      { status: TruckStatus.ON_TRIP },
      user,
    );
    await this.driversService.update(
      trip.driverId,
      { status: DriverStatus.ON_TRIP },
      user,
    );

    return saved;
  }

  async finish(
    id: string,
    dto: FinishTripDto,
    user: ActiveUserInterface,
  ): Promise<Trip> {
    const trip = await this.assertOwnedByDriver(id, user);
    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException('El viaje no está en curso.');
    }
    if (
      trip.startOdometerKm != null &&
      dto.endOdometerKm < trip.startOdometerKm
    ) {
      throw new BadRequestException(
        'El odómetro final no puede ser menor al inicial.',
      );
    }

    trip.status = TripStatus.FINISHED;
    trip.finishedAt = new Date();
    trip.endOdometerKm = dto.endOdometerKm;
    if (trip.startOdometerKm != null) {
      trip.distanceKm = dto.endOdometerKm - trip.startOdometerKm;
    }
    trip.updatedBy = user.id;
    const saved = await this.tripsRepository.save(trip);

    // Actualizar odómetro del camión y liberar camión + chofer.
    await this.trucksService.updateOdometer(
      trip.truckId,
      { currentOdometerKm: dto.endOdometerKm },
      user,
    );
    await this.trucksService.update(
      trip.truckId,
      { status: TruckStatus.AVAILABLE },
      user,
    );
    await this.driversService.update(
      trip.driverId,
      { status: DriverStatus.ACTIVE },
      user,
    );

    return saved;
  }

  async cancel(id: string, user: ActiveUserInterface): Promise<Trip> {
    const trip = await this.findOne(id);
    if (trip.status === TripStatus.FINISHED) {
      throw new BadRequestException(
        'No se puede cancelar un viaje finalizado.',
      );
    }
    trip.status = TripStatus.CANCELED;
    trip.updatedBy = user.id;
    // Liberar recursos si estaba en curso.
    if (trip.startedAt) {
      await this.trucksService.update(
        trip.truckId,
        { status: TruckStatus.AVAILABLE },
        user,
      );
      await this.driversService.update(
        trip.driverId,
        { status: DriverStatus.ACTIVE },
        user,
      );
    }
    return this.tripsRepository.save(trip);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const trip = await this.findOne(id);
    trip.deletedBy = user.id;
    await this.tripsRepository.save(trip);
    return this.tripsRepository.softDelete(id);
  }

  /** Verifica que el viaje pertenezca al chofer autenticado. */
  private async assertOwnedByDriver(
    id: string,
    user: ActiveUserInterface,
  ): Promise<Trip> {
    const trip = await this.findOne(id);
    const driver = await this.driversService.findByUserId(user.id);
    if (trip.driverId !== driver.id) {
      throw new ForbiddenException('Este viaje no está asignado a usted.');
    }
    return trip;
  }

  private async generateCode(): Promise<string> {
    const count = await this.tripsRepository.count();
    return `V-${(count + 1).toString().padStart(5, '0')}`;
  }
}
