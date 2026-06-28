import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
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
import { TrucksService } from 'src/fleet/trucks.service';
import { DriversService } from 'src/drivers/drivers.service';
import { ChecklistsService } from 'src/checklists/checklists.service';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    private readonly trucksService: TrucksService,
    private readonly driversService: DriversService,
    private readonly checklistsService: ChecklistsService,
  ) {}

  async create(dto: CreateTripDto, user: ActiveUserInterface): Promise<Trip> {
    const trip = this.tripsRepository.create({
      ...dto,
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
    },
  ): Promise<Pagination<Trip>> {
    return paginateAndSearch<Trip>(this.tripsRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search: filters.search,
      searchFields: ['code', 'origin', 'destination'],
      orderBy: 'createdAt',
      order: 'DESC',
      relations: ['truck', 'driver', 'driver.user', 'trailer'],
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
      relations: ['truck', 'driver', 'driver.user', 'trailer'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    return trip;
  }

  async findMine(
    userId: string,
    status?: TripStatus,
  ): Promise<Trip[]> {
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
    Object.assign(trip, dto, { updatedBy: user.id });
    return this.tripsRepository.save(trip);
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

    await this.trucksService.update(trip.truckId, { status: TruckStatus.ON_TRIP }, user);
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
    if (trip.startOdometerKm != null && dto.endOdometerKm < trip.startOdometerKm) {
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
    await this.trucksService.update(trip.truckId, { status: TruckStatus.AVAILABLE }, user);
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
      throw new BadRequestException('No se puede cancelar un viaje finalizado.');
    }
    trip.status = TripStatus.CANCELED;
    trip.updatedBy = user.id;
    // Liberar recursos si estaba en curso.
    if (trip.startedAt) {
      await this.trucksService.update(trip.truckId, { status: TruckStatus.AVAILABLE }, user);
      await this.driversService.update(trip.driverId, { status: DriverStatus.ACTIVE }, user);
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
