import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Incident } from './entities/incident.entity';
import { IncidentEvent } from './entities/incident-event.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { AssignIncidentDto } from './dto/assign-incident.dto';
import { ChangeIncidentStatusDto } from './dto/change-status.dto';
import { CommentIncidentDto } from './dto/comment-incident.dto';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from 'src/common/enums/incident.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { DriversService } from 'src/drivers/drivers.service';
import { IncidentsGateway } from './incidents.gateway';
import { AlertsService } from 'src/alerts/alerts.service';

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
  ) {}

  async create(
    dto: CreateIncidentDto,
    user: ActiveUserInterface,
  ): Promise<Incident> {
    const driver = await this.driversService.findByUserId(user.id);

    const severity =
      dto.severity ??
      (dto.type === IncidentType.ACCIDENT || dto.type === IncidentType.EMERGENCY
        ? IncidentSeverity.CRITICAL
        : IncidentSeverity.MEDIUM);

    const incident = this.incidentsRepository.create({
      ...dto,
      severity,
      driverId: driver.id,
      code: await this.generateCode(),
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
    },
  ): Promise<Pagination<Incident>> {
    const page = Number(options.page);
    const limit = Number(options.limit);

    const qb = this.incidentsRepository
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.truck', 'truck')
      .leftJoinAndSelect('i.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'user')
      .orderBy('i.createdAt', 'DESC');

    if (filters.status) qb.andWhere('i.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('i.type = :type', { type: filters.type });
    if (filters.severity) qb.andWhere('i.severity = :severity', { severity: filters.severity });
    if (filters.truckId) qb.andWhere('i.truckId = :truckId', { truckId: filters.truckId });
    if (filters.unassigned) qb.andWhere('i.assignedToUserId IS NULL');

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
      relations: ['truck', 'driver', 'driver.user', 'events'],
      order: { events: { at: 'ASC' } },
    });
    if (!incident) throw new NotFoundException('Incidente no encontrado.');
    return incident;
  }

  async assign(
    id: string,
    dto: AssignIncidentDto,
    user: ActiveUserInterface,
  ): Promise<Incident> {
    const incident = await this.findOne(id);
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
    incident.status = dto.status;
    if (dto.status === IncidentStatus.RESOLVED) incident.resolvedAt = new Date();
    incident.updatedBy = user.id;
    await this.incidentsRepository.save(incident);
    await this.addEvent(id, user.id, 'status_changed', dto.note ?? dto.status);
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

  private async generateCode(): Promise<string> {
    const count = await this.incidentsRepository.count();
    return `INC-${(count + 1).toString().padStart(5, '0')}`;
  }
}
