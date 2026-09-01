import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Incident } from './entities/incident.entity';
import { IncidentEvent } from './entities/incident-event.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { AssignIncidentDto } from './dto/assign-incident.dto';
import { ChangeIncidentStatusDto } from './dto/change-status.dto';
import { ChangeIncidentSeverityDto } from './dto/change-severity.dto';
import { CommentIncidentDto } from './dto/comment-incident.dto';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from 'src/common/enums/incident.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { User } from 'src/users/entities/user.entity';
import { DriversService } from 'src/drivers/drivers.service';
import { IncidentsGateway } from './incidents.gateway';
import { AlertsService } from 'src/alerts/alerts.service';
import { SequencesService } from 'src/common/sequences/sequences.service';
import { SequenceKey } from 'src/common/entities/company-sequence.entity';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';
import { CatalogsService } from 'src/catalogs/catalogs.service';
import { CATALOG } from 'src/catalogs/catalogs.catalog';
import {
  assertNoCerrado,
  assertPuedeReabrir,
  exigirMotivo,
} from 'src/common/utils/registro-cerrado.util';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidentsRepository: Repository<Incident>,
    @InjectRepository(IncidentEvent)
    private readonly eventsRepository: Repository<IncidentEvent>,
    private readonly driversService: DriversService,
    private readonly gateway: IncidentsGateway,
    private readonly alertsService: AlertsService,
    private readonly sequences: SequencesService,
    private readonly auditLog: AuditLogService,
    private readonly catalogsService: CatalogsService,
  ) {}

  async create(
    dto: CreateIncidentDto,
    user: ActiveUserInterface,
  ): Promise<Incident> {
    const driver = await this.driversService.findByUserId(user.id);

    // El tipo sale del catálogo de la empresa, que puede tener los suyos: es lo
    // que antes garantizaba el `@IsEnum` del DTO (docs/CONFIGURACION.md §5).
    const tipos = await this.catalogsService.items(CATALOG.INCIDENT_TYPE);
    const tipo = tipos.find((t) => t.key === dto.type);
    if (!tipo || !tipo.isActive) {
      throw new BadRequestException(
        `Tipo de incidente no disponible: ${dto.type}`,
      );
    }

    const severity =
      dto.severity ??
      (dto.type === IncidentType.ACCIDENT || dto.type === IncidentType.EMERGENCY
        ? IncidentSeverity.CRITICAL
        : IncidentSeverity.MEDIUM);

    const incident = this.incidentsRepository.create({
      ...dto,
      severity,
      driverId: driver.id,
      // El incidente pertenece a la misma empresa que el chofer que lo reporta.
      // A partir de la fase 2 la empresa viaja en el token y se lee de `user`.
      companyId: driver.companyId,
      code: await this.generateCode(driver.companyId),
      createdBy: user.id,
    });
    const saved = await this.incidentsRepository.save(incident);

    await this.addEvent(saved.id, user.id, 'created', dto.description);
    const full = await this.findOne(saved.id);

    this.gateway.emitNew(full);
    await this.alertsService.createFromIncident({
      id: full.id,
      code: full.code,
      severity: full.severity,
      type: full.type,
    });

    return full;
  }

  paginate(
    options: IPaginationOptions,
    filters: {
      status?: IncidentStatus;
      type?: IncidentType;
      severity?: IncidentSeverity;
      truckId?: string;
      unassigned?: boolean;
      assignedToUserId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<Pagination<Incident>> {
    const page = Number(options.page);
    const limit = Number(options.limit);

    const qb = this.incidentsRepository
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.truck', 'truck')
      .leftJoinAndSelect('i.driver', 'driver')
      .leftJoinAndSelect('driver.employee', 'employee')
      .leftJoin('i.assignedTo', 'assignedTo')
      .addSelect(['assignedTo.id', 'assignedTo.name'])
      .orderBy('i.createdAt', 'DESC');

    if (filters.status) qb.andWhere('i.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('i.type = :type', { type: filters.type });
    if (filters.severity) qb.andWhere('i.severity = :severity', { severity: filters.severity });
    if (filters.truckId) qb.andWhere('i.truckId = :truckId', { truckId: filters.truckId });
    if (filters.unassigned) qb.andWhere('i.assignedToUserId IS NULL');
    if (filters.assignedToUserId)
      qb.andWhere('i.assignedToUserId = :assignedToUserId', {
        assignedToUserId: filters.assignedToUserId,
      });
    if (filters.from) qb.andWhere('i.createdAt >= :from', { from: filters.from });
    if (filters.to)
      qb.andWhere('i.createdAt < :to', { to: this.addOneDay(filters.to) });

    return qb
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount()
      .then(([items, total]) => ({
        items,
        meta: {
          totalItems: total,
          itemCount: items.length,
          itemsPerPage: limit,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
        },
      })) as Promise<Pagination<Incident>>;
  }

  async findMine(userId: string): Promise<Incident[]> {
    const driver = await this.driversService.findByUserId(userId);
    return this.incidentsRepository.find({
      where: { driverId: driver.id },
      relations: ['truck'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Incident> {
    const incident = await this.incidentsRepository.findOne({
      where: { id },
      relations: [
        'truck',
        'driver',
        'driver.employee',
        'assignedTo',
        'events',
        'events.user',
      ],
      order: { events: { at: 'ASC' } },
    });
    if (!incident) throw new NotFoundException('Incidente no encontrado.');
    // Exponemos solo id y nombre del responsable y del autor de cada evento
    // (sin email/rol/etc.).
    if (incident.assignedTo)
      incident.assignedTo = {
        id: incident.assignedTo.id,
        name: incident.assignedTo.name,
      } as User;
    incident.events?.forEach((e) => {
      if (e.user) e.user = { id: e.user.id, name: e.user.name } as User;
    });
    return incident;
  }

  async assign(
    id: string,
    dto: AssignIncidentDto,
    user: ActiveUserInterface,
  ): Promise<Incident> {
    const incident = await this.findOne(id);
    this.assertNoResuelto(incident, 'reasignarlo');
    incident.assignedToUserId = dto.assignedToUserId;
    if (incident.status === IncidentStatus.PENDING) {
      incident.status = IncidentStatus.IN_PROGRESS;
    }
    incident.updatedBy = user.id;
    await this.incidentsRepository.save(incident);
    await this.addEvent(id, user.id, 'assigned', `Asignado a ${dto.assignedToUserId}`);
    return this.emitAndReturn(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeIncidentStatusDto,
    user: ActiveUserInterface,
  ): Promise<Incident> {
    const incident = await this.findOne(id);
    const estabaResuelto = incident.status === IncidentStatus.RESOLVED;
    const reabre = estabaResuelto && dto.status !== IncidentStatus.RESOLVED;

    // Volver a "resolver" lo ya resuelto sólo pisaría la fecha de resolución
    // con una posterior: se pierde cuándo se resolvió de verdad.
    assertNoCerrado(
      estabaResuelto && dto.status === IncidentStatus.RESOLVED,
      'El incidente ya está resuelto.',
    );

    if (reabre) {
      assertPuedeReabrir(user);
      const motivo = exigirMotivo(dto.note, 'el incidente');
      incident.resolvedAt = null;
      incident.status = dto.status;
      incident.updatedBy = user.id;
      await this.incidentsRepository.save(incident);
      // Doble registro a propósito: el evento es lo que ve el despacho en la
      // ficha del incidente; la auditoría es lo que ve el auditor, y sobrevive
      // aunque el incidente se borre.
      await this.addEvent(id, user.id, 'reopened', motivo);
      await this.auditLog.registrar(user, {
        action: AUDIT.INCIDENT_REOPENED,
        companyId: user.companyId,
        entityType: 'incident',
        entityId: id,
        metadata: { code: incident.code, estadoNuevo: dto.status, motivo },
      });
      return this.emitAndReturn(id);
    }

    incident.status = dto.status;
    if (dto.status === IncidentStatus.RESOLVED) incident.resolvedAt = new Date();
    incident.updatedBy = user.id;
    await this.incidentsRepository.save(incident);
    await this.addEvent(id, user.id, 'status_changed', dto.note ?? dto.status);
    return this.emitAndReturn(id);
  }

  async changeSeverity(
    id: string,
    dto: ChangeIncidentSeverityDto,
    user: ActiveUserInterface,
  ): Promise<Incident> {
    const incident = await this.findOne(id);
    this.assertNoResuelto(incident, 'cambiarle la gravedad');
    const previous = incident.severity;
    incident.severity = dto.severity;
    incident.updatedBy = user.id;
    await this.incidentsRepository.save(incident);
    await this.addEvent(
      id,
      user.id,
      'severity_changed',
      `${previous} → ${dto.severity}`,
    );
    return this.emitAndReturn(id);
  }

  async comment(
    id: string,
    dto: CommentIncidentDto,
    user: ActiveUserInterface,
  ): Promise<Incident> {
    await this.findOne(id);
    await this.addEvent(id, user.id, 'comment', dto.note);
    return this.emitAndReturn(id);
  }

  /**
   * Un incidente resuelto no se retoca por los costados.
   *
   * Reasignarlo o cambiarle la gravedad después de cerrado deja un registro que
   * no se corresponde con cómo se trabajó: la gravedad con la que se atendió el
   * hecho es la que tenía mientras estaba abierto. Si hace falta cambiar algo,
   * primero se reabre —con motivo, y eso queda auditado— y recién ahí se toca.
   */
  private assertNoResuelto(incident: Incident, queSeIntenta: string) {
    assertNoCerrado(
      incident.status === IncidentStatus.RESOLVED,
      `El incidente está resuelto: para ${queSeIntenta} hay que reabrirlo primero.`,
    );
  }

  private async emitAndReturn(id: string): Promise<Incident> {
    const full = await this.findOne(id);
    this.gateway.emitUpdate(full);
    return full;
  }

  private addEvent(
    incidentId: string,
    userId: string,
    action: string,
    note?: string,
  ) {
    return this.eventsRepository.save(
      this.eventsRepository.create({ incidentId, userId, action, note }),
    );
  }

  /**
   * Suma un día a una fecha 'YYYY-MM-DD' para que el filtro `to` incluya todo
   * ese día: createdAt < (to + 1 día) cubre desde 00:00 hasta 23:59:59 de `to`.
   */
  private addOneDay(date: string): Date {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d;
  }

  /**
   * Correlativo por empresa. Ver el comentario de `SequencesService`: el
   * `count()` anterior mezclaba empresas y repetía códigos.
   */
  private generateCode(companyId: string): Promise<string> {
    return this.sequences.nextCode(companyId, SequenceKey.INCIDENT, 'INC-');
  }
}
