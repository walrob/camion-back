import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmploymentMovement } from './entities/employment-movement.entity';
import { Employee } from './entities/employee.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import {
  EmploymentMovementType,
  LeaveType,
  MOVEMENT_RESULTING_STATUS,
  PERIOD_MOVEMENT_TYPES,
  isPeriodMovement,
} from 'src/common/enums/employmentMovement.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

/** Fecha de hoy en 'YYYY-MM-DD' (las columnas `date` se comparan como string). */
const asDateStr = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const today = (): string => asDateStr(new Date());

/**
 * Movimientos que dejan al empleado sin poder manejar. Cargar uno de estos
 * exige que no haya viajes sin cerrar en el período: no se puede estar de
 * licencia y en la ruta al mismo tiempo.
 */
const BLOCKING_TYPES: readonly EmploymentMovementType[] = [
  EmploymentMovementType.LEAVE,
  EmploymentMovementType.SUSPENSION,
  EmploymentMovementType.TERMINATION,
];

/** Viajes que todavía ocupan al chofer. */
const OPEN_TRIP_STATUSES = [TripStatus.ASSIGNED, TripStatus.IN_PROGRESS];

@Injectable()
export class EmploymentMovementsService {
  private readonly logger = new Logger(EmploymentMovementsService.name);

  constructor(
    @InjectRepository(EmploymentMovement)
    private readonly movementsRepository: Repository<EmploymentMovement>,
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,
    // Repositorios y no servicios: TripsModule ya importa HrModule, así que
    // depender de TripsService/DriversService cerraría un ciclo de módulos.
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
  ) {}

  // ───────────────────────── Cálculo del estado ─────────────────────────

  /**
   * Estado laboral que surge del historial a una fecha dada.
   *
   * Se recorren en orden cronológico los movimientos ya iniciados; gana el
   * último. Las licencias y suspensiones cuyo período ya terminó devuelven al
   * empleado a ACTIVE, así el estado se "auto-cierra" sin intervención manual.
   */
  computeStatus(
    movements: EmploymentMovement[],
    asOf: string = today(),
  ): EmploymentStatus {
    return this.resolveAt(movements, asOf).status;
  }

  /**
   * Igual que `computeStatus` pero además devuelve el movimiento responsable del
   * estado, que es lo que necesita quien tenga que explicarlo ("de licencia
   * hasta el X") o cerrarlo.
   */
  resolveAt(
    movements: EmploymentMovement[],
    asOf: string = today(),
  ): { status: EmploymentStatus; movement: EmploymentMovement | null } {
    const applied = movements
      .filter((m) => m.startDate <= asOf)
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );

    let status = EmploymentStatus.ACTIVE;
    let movement: EmploymentMovement | null = null;
    for (const m of applied) {
      if (isPeriodMovement(m.type)) {
        const stillOpen = !m.endDate || m.endDate >= asOf;
        status = stillOpen
          ? MOVEMENT_RESULTING_STATUS[m.type]
          : EmploymentStatus.ACTIVE;
        movement = stillOpen ? m : null;
      } else {
        status = MOVEMENT_RESULTING_STATUS[m.type];
        movement = m;
      }
    }
    return { status, movement };
  }

  /** Situación del legajo en una fecha dada, leyendo el historial de la base. */
  async statusAt(
    employeeId: string,
    asOf: string = today(),
  ): Promise<{ status: EmploymentStatus; movement: EmploymentMovement | null }> {
    const movements = await this.movementsRepository.find({
      where: { employeeId },
    });
    return this.resolveAt(movements, asOf);
  }

  /** Cierra un período en una fecha puntual (no necesariamente hoy). */
  closeAt(
    id: string,
    endDate: string,
    user: ActiveUserInterface,
  ): Promise<EmploymentMovement> {
    return this.update(id, { endDate }, user);
  }

  /**
   * Recalcula `employmentStatus`, `hireDate` y `terminationDate` del empleado a
   * partir de su historial. Se llama después de cada alta/edición/baja de
   * movimiento y desde el cron diario.
   */
  async recomputeEmployee(employeeId: string): Promise<EmploymentStatus> {
    const employee = await this.employeesRepository.findOne({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado.');

    const movements = await this.movementsRepository.find({
      where: { employeeId },
    });

    // Sin historial no se toca nada: puede ser un legajo cargado antes de que
    // existieran los movimientos.
    if (!movements.length) return employee.employmentStatus;

    const status = this.computeStatus(movements);

    const hires = movements
      .filter((m) => m.type === EmploymentMovementType.HIRE)
      .map((m) => m.startDate)
      .sort();
    const terminations = movements
      .filter((m) => m.type === EmploymentMovementType.TERMINATION)
      .map((m) => m.startDate)
      .sort();

    employee.employmentStatus = status;
    if (hires.length) employee.hireDate = hires[0];
    employee.terminationDate =
      status === EmploymentStatus.TERMINATED && terminations.length
        ? terminations[terminations.length - 1]
        : null;

    await this.employeesRepository.save(employee);
    return status;
  }

  // ───────────────────────── CRUD ─────────────────────────

  async create(
    dto: CreateMovementDto,
    user: ActiveUserInterface,
  ): Promise<EmploymentMovement> {
    const employee = await this.employeesRepository.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado.');

    this.assertConsistent(dto.type, dto.leaveType, dto.startDate, dto.endDate);
    await this.assertNoOverlap(
      dto.employeeId,
      dto.type,
      dto.startDate,
      dto.endDate,
    );
    await this.assertNoConflictingTrips(
      dto.employeeId,
      dto.type,
      dto.startDate,
      dto.endDate,
    );

    const movement = this.movementsRepository.create({
      ...dto,
      leaveType:
        dto.type === EmploymentMovementType.LEAVE
          ? (dto.leaveType ?? LeaveType.OTHER)
          : null,
      endDate: isPeriodMovement(dto.type) ? (dto.endDate ?? null) : null,
      resultingStatus: MOVEMENT_RESULTING_STATUS[dto.type],
      createdBy: user.id,
    });
    const saved = await this.movementsRepository.save(movement);

    await this.recomputeEmployee(dto.employeeId);
    return saved;
  }

  /** Historial completo del legajo, del más reciente al más viejo. */
  listByEmployee(employeeId: string): Promise<EmploymentMovement[]> {
    return this.movementsRepository.find({
      where: { employeeId },
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
  }

  /** Licencias y suspensiones vigentes hoy, para el tablero de RRHH. */
  async active(): Promise<EmploymentMovement[]> {
    const asOf = today();
    const periods = await this.movementsRepository.find({
      where: PERIOD_MOVEMENT_TYPES.map((type) => ({ type })),
      relations: ['employee'],
      order: { startDate: 'DESC' },
    });
    return periods.filter(
      (m) => m.startDate <= asOf && (!m.endDate || m.endDate >= asOf),
    );
  }

  async findOne(id: string): Promise<EmploymentMovement> {
    const movement = await this.movementsRepository.findOne({ where: { id } });
    if (!movement) throw new NotFoundException('Movimiento no encontrado.');
    return movement;
  }

  async update(
    id: string,
    dto: UpdateMovementDto,
    user: ActiveUserInterface,
  ): Promise<EmploymentMovement> {
    const movement = await this.findOne(id);

    const type = dto.type ?? movement.type;
    const startDate = dto.startDate ?? movement.startDate;
    // `endDate: null` explícito reabre el período; `undefined` lo deja como está.
    const endDate = dto.endDate !== undefined ? dto.endDate : movement.endDate;
    const leaveType = dto.leaveType ?? movement.leaveType;

    this.assertConsistent(type, leaveType, startDate, endDate);
    await this.assertNoOverlap(
      movement.employeeId,
      type,
      startDate,
      endDate,
      id,
    );
    await this.assertNoConflictingTrips(
      movement.employeeId,
      type,
      startDate,
      endDate,
    );

    Object.assign(movement, dto, {
      type,
      startDate,
      endDate: isPeriodMovement(type) ? (endDate ?? null) : null,
      leaveType:
        type === EmploymentMovementType.LEAVE
          ? (leaveType ?? LeaveType.OTHER)
          : null,
      resultingStatus: MOVEMENT_RESULTING_STATUS[type],
      updatedBy: user.id,
    });
    const saved = await this.movementsRepository.save(movement);

    await this.recomputeEmployee(movement.employeeId);
    return saved;
  }

  /** Cierra hoy una licencia/suspensión abierta (reincorporación anticipada). */
  async close(id: string, user: ActiveUserInterface): Promise<EmploymentMovement> {
    const movement = await this.findOne(id);
    if (!isPeriodMovement(movement.type)) {
      throw new BadRequestException(
        'Solo las licencias y suspensiones tienen período que cerrar.',
      );
    }
    return this.update(id, { endDate: today() }, user);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const movement = await this.findOne(id);
    movement.deletedBy = user.id;
    await this.movementsRepository.save(movement);
    const result = await this.movementsRepository.softDelete(id);

    await this.recomputeEmployee(movement.employeeId);
    return result;
  }

  // ───────────────────────── Validaciones ─────────────────────────

  private assertConsistent(
    type: EmploymentMovementType,
    leaveType: LeaveType | undefined | null,
    startDate: string,
    endDate: string | undefined | null,
  ) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la de inicio.',
      );
    }
    if (endDate && !isPeriodMovement(type)) {
      throw new BadRequestException(
        'Solo las licencias y suspensiones admiten fecha de fin.',
      );
    }
    if (leaveType && type !== EmploymentMovementType.LEAVE) {
      throw new BadRequestException(
        'El motivo de licencia solo aplica a movimientos de tipo licencia.',
      );
    }
  }

  /**
   * No se puede dejar a un chofer sin actividad si tiene viajes sin cerrar en
   * ese período. A diferencia de la asignación de viajes —donde el despacho
   * puede forzar el cierre de una licencia—, acá no hay escape: primero se
   * cancela o finaliza el viaje, porque puede haber un camión y una carga en
   * la ruta.
   */
  private async assertNoConflictingTrips(
    employeeId: string,
    type: EmploymentMovementType,
    startDate: string,
    endDate: string | undefined | null,
  ) {
    if (!BLOCKING_TYPES.includes(type)) return;

    const driver = await this.driversRepository.findOne({
      where: { employeeId },
    });
    if (!driver) return; // el empleado no maneja: nada que validar

    const openTrips = await this.tripsRepository.find({
      where: { driverId: driver.id, status: In(OPEN_TRIP_STATUSES) },
      order: { plannedStartAt: 'ASC' },
    });

    const conflicting = openTrips.filter((trip) => {
      const start = trip.startedAt ?? trip.plannedStartAt;
      if (!start) return false;
      const tripStart = asDateStr(start);
      const tripEnd = trip.plannedEndAt
        ? asDateStr(trip.plannedEndAt)
        : tripStart;
      // Se pisan si el viaje empieza antes de que termine el movimiento y
      // termina después de que el movimiento empieza.
      return (!endDate || tripStart <= endDate) && tripEnd >= startDate;
    });

    if (!conflicting.length) return;

    const detail = conflicting
      .slice(0, 3)
      .map((t) => {
        const start = t.startedAt ?? t.plannedStartAt;
        const when = start ? asDateStr(start) : 'sin fecha';
        const estado =
          t.status === TripStatus.IN_PROGRESS ? 'en curso' : 'asignado';
        return `${t.code} (${t.origin} → ${t.destination}, ${when}, ${estado})`;
      })
      .join('; ');
    const resto =
      conflicting.length > 3 ? ` y ${conflicting.length - 3} más` : '';

    throw new BadRequestException(
      `El chofer tiene ${conflicting.length} viaje(s) sin cerrar en ese período: ${detail}${resto}. ` +
        'Cancelá o finalizá el/los viaje(s) antes de cargar el movimiento.',
    );
  }

  /**
   * Licencias y suspensiones son estados excluyentes: no puede haber dos
   * períodos pisándose en el mismo legajo.
   */
  private async assertNoOverlap(
    employeeId: string,
    type: EmploymentMovementType,
    startDate: string,
    endDate: string | undefined | null,
    excludeId?: string,
  ) {
    if (!isPeriodMovement(type)) return;

    const existing = await this.movementsRepository.find({
      where: PERIOD_MOVEMENT_TYPES.map((t) => ({
        employeeId,
        type: t,
        ...(excludeId && { id: Not(excludeId) }),
      })),
    });

    const overlaps = existing.find(
      (m) =>
        (!endDate || m.startDate <= endDate) &&
        (!m.endDate || m.endDate >= startDate),
    );
    if (overlaps) {
      throw new BadRequestException(
        `El período se superpone con otro movimiento del legajo (${overlaps.startDate}` +
          `${overlaps.endDate ? ` a ${overlaps.endDate}` : ' en adelante'}).`,
      );
    }
  }

  // ───────────────────────── Cron ─────────────────────────

  /**
   * Cierra los estados vencidos: cuando una licencia o suspensión llega a su
   * `endDate`, el empleado vuelve a ACTIVE sin que RRHH tenga que tocar nada.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async recalculateStatuses(): Promise<void> {
    const employeeIds = await this.movementsRepository
      .createQueryBuilder('m')
      .select('DISTINCT m.employeeId', 'employeeId')
      .where('m.deletedAt IS NULL')
      .getRawMany<{ employeeId: string }>();

    let changed = 0;
    for (const { employeeId } of employeeIds) {
      const employee = await this.employeesRepository.findOne({
        where: { id: employeeId },
      });
      if (!employee) continue;
      const before = employee.employmentStatus;
      const after = await this.recomputeEmployee(employeeId);
      if (before !== after) changed++;
    }
    if (changed) {
      this.logger.log(`Estados laborales recalculados: ${changed}`);
    }
  }
}
