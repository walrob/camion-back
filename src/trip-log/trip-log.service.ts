import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripLogEntry } from './entities/trip-log-entry.entity';
import { CreateTripLogEntryDto } from './dto/create-trip-log-entry.dto';
import { UpdateTripLogEntryDto } from './dto/update-trip-log-entry.dto';
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { TripsService } from 'src/trips/trips.service';
import { DriversService } from 'src/drivers/drivers.service';

@Injectable()
export class TripLogService {
  constructor(
    @InjectRepository(TripLogEntry)
    private readonly entriesRepository: Repository<TripLogEntry>,
    private readonly tripsService: TripsService,
    private readonly driversService: DriversService,
  ) {}

  async create(
    dto: CreateTripLogEntryDto,
    user: ActiveUserInterface,
  ): Promise<TripLogEntry> {
    // Idempotencia: si ya existe una entrada con ese clientId, devolverla.
    if (dto.clientId) {
      const existing = await this.entriesRepository.findOne({
        where: { clientId: dto.clientId },
      });
      if (existing) return existing;
    }

    const trip = await this.tripsService.findOne(dto.tripId);
    await this.assertTripOwnedByDriver(trip.driverId, user);

    if (
      trip.status !== TripStatus.ASSIGNED &&
      trip.status !== TripStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'No se pueden cargar gastos en un viaje finalizado o cancelado.',
      );
    }

    const entry = this.entriesRepository.create({
      ...dto,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      createdBy: user.id,
    });
    return this.entriesRepository.save(entry);
  }

  listByTrip(tripId: string): Promise<TripLogEntry[]> {
    return this.entriesRepository.find({
      where: { tripId },
      order: { occurredAt: 'DESC' },
    });
  }

  async listMine(userId: string): Promise<TripLogEntry[]> {
    const driver = await this.driversService.findByUserId(userId);
    return this.entriesRepository
      .createQueryBuilder('e')
      .innerJoin('e.trip', 't')
      .where('t.driverId = :driverId', { driverId: driver.id })
      .orderBy('e.occurredAt', 'DESC')
      .getMany();
  }

  /** Totales por tipo, total general y total de adelantos del viaje. */
  async summary(tripId: string) {
    const entries = await this.entriesRepository.find({ where: { tripId } });

    const byType: Record<string, number> = {};
    let total = 0;
    let totalAdvances = 0;

    for (const e of entries) {
      const amount = Number(e.amount);
      byType[e.type] = (byType[e.type] ?? 0) + amount;
      if (e.type === TripLogType.CASH_ADVANCE) totalAdvances += amount;
      else total += amount;
    }

    return {
      byType,
      totalExpenses: total,
      totalAdvances,
      netToSettle: total - totalAdvances,
      count: entries.length,
    };
  }

  async listByTripOwned(tripId: string, user: ActiveUserInterface) {
    const trip = await this.tripsService.findOne(tripId);
    await this.assertTripOwnedByDriver(trip.driverId, user);
    return this.listByTrip(tripId);
  }

  async summaryOwned(tripId: string, user: ActiveUserInterface) {
    const trip = await this.tripsService.findOne(tripId);
    await this.assertTripOwnedByDriver(trip.driverId, user);
    return this.summary(tripId);
  }

  async findOne(id: string): Promise<TripLogEntry> {
    const entry = await this.entriesRepository.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Entrada de bitácora no encontrada.');
    return entry;
  }

  async update(
    id: string,
    dto: UpdateTripLogEntryDto,
    user: ActiveUserInterface,
  ): Promise<TripLogEntry> {
    const entry = await this.findOne(id);
    await this.assertEditable(entry, user);
    Object.assign(entry, dto, { updatedBy: user.id });
    return this.entriesRepository.save(entry);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const entry = await this.findOne(id);
    await this.assertEditable(entry, user);
    entry.deletedBy = user.id;
    await this.entriesRepository.save(entry);
    return this.entriesRepository.softDelete(id);
  }

  private async assertEditable(
    entry: TripLogEntry,
    user: ActiveUserInterface,
  ) {
    const trip = await this.tripsService.findOne(entry.tripId);
    if (trip.status === TripStatus.FINISHED || trip.status === TripStatus.CANCELED) {
      throw new BadRequestException(
        'La bitácora del viaje está cerrada y no puede modificarse.',
      );
    }
    await this.assertTripOwnedByDriver(trip.driverId, user);
  }

  private async assertTripOwnedByDriver(
    tripDriverId: string,
    user: ActiveUserInterface,
  ) {
    const driver = await this.driversService.findByUserId(user.id);
    if (tripDriverId !== driver.id) {
      throw new ForbiddenException('Este viaje no está asignado a usted.');
    }
  }
}
