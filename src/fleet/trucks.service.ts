import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Truck } from './entities/truck.entity';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { UpdateOdometerDto } from './dto/update-odometer.dto';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';

@Injectable()
export class TrucksService {
  constructor(
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
  ) {}

  async create(dto: CreateTruckDto, user: ActiveUserInterface): Promise<Truck> {
    await this.assertPlateAvailable(dto.plate);
    const truck = this.trucksRepository.create({ ...dto, createdBy: user.id });
    return this.trucksRepository.save(truck);
  }

  paginate(
    options: IPaginationOptions,
    search?: string,
    status?: TruckStatus,
    fleetId?: string,
  ): Promise<Pagination<Truck>> {
    return paginateAndSearch<Truck>(this.trucksRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search,
      searchFields: ['plate', 'internalNumber', 'brand', 'model'],
      orderBy: 'plate',
      order: 'ASC',
      relations: ['fleet'],
      baseWhere: {
        ...(status && { status }),
        ...(fleetId && { fleetId }),
      },
    });
  }

  async findOne(id: string): Promise<Truck> {
    const truck = await this.trucksRepository.findOne({
      where: { id },
      relations: ['fleet'],
    });
    if (!truck) throw new NotFoundException('Camión no encontrado.');
    return truck;
  }

  async update(
    id: string,
    dto: UpdateTruckDto,
    user: ActiveUserInterface,
  ): Promise<Truck> {
    const truck = await this.findOne(id);
    if (dto.plate && dto.plate !== truck.plate) {
      await this.assertPlateAvailable(dto.plate);
    }
    Object.assign(truck, dto, { updatedBy: user.id });
    return this.trucksRepository.save(truck);
  }

  async updateOdometer(
    id: string,
    dto: UpdateOdometerDto,
    user: ActiveUserInterface,
  ): Promise<Truck> {
    const truck = await this.findOne(id);
    if (dto.currentOdometerKm !== undefined) {
      if (dto.currentOdometerKm < truck.currentOdometerKm) {
        throw new BadRequestException(
          'El odómetro no puede ser menor al valor actual.',
        );
      }
      truck.currentOdometerKm = dto.currentOdometerKm;
    }
    if (dto.engineHours !== undefined) truck.engineHours = dto.engineHours;
    truck.updatedBy = user.id;
    return this.trucksRepository.save(truck);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const truck = await this.findOne(id);
    truck.deletedBy = user.id;
    await this.trucksRepository.save(truck);
    return this.trucksRepository.softDelete(id);
  }

  private async assertPlateAvailable(plate: string) {
    const existing = await this.trucksRepository.findOne({ where: { plate } });
    if (existing) {
      throw new BadRequestException(`Ya existe un camión con patente ${plate}.`);
    }
  }
}
