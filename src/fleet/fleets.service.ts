import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Fleet } from './entities/fleet.entity';
import { CreateFleetDto } from './dto/create-fleet.dto';
import { UpdateFleetDto } from './dto/update-fleet.dto';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';

@Injectable()
export class FleetsService {
  constructor(
    @InjectRepository(Fleet)
    private readonly fleetsRepository: Repository<Fleet>,
  ) {}

  async create(dto: CreateFleetDto, user: ActiveUserInterface): Promise<Fleet> {
    await this.assertCodeAvailable(dto.code);
    const fleet = this.fleetsRepository.create({ ...dto, createdBy: user.id });
    return this.fleetsRepository.save(fleet);
  }

  paginate(
    options: IPaginationOptions,
    search?: string,
  ): Promise<Pagination<Fleet>> {
    return paginateAndSearch<Fleet>(this.fleetsRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search,
      searchFields: ['name', 'code'],
      orderBy: 'name',
      order: 'ASC',
    });
  }

  findAll(): Promise<Fleet[]> {
    return this.fleetsRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Fleet> {
    const fleet = await this.fleetsRepository.findOne({ where: { id } });
    if (!fleet) throw new NotFoundException('Flota no encontrada.');
    return fleet;
  }

  async update(
    id: string,
    dto: UpdateFleetDto,
    user: ActiveUserInterface,
  ): Promise<Fleet> {
    const fleet = await this.findOne(id);
    if (dto.code && dto.code !== fleet.code) {
      await this.assertCodeAvailable(dto.code);
    }
    Object.assign(fleet, dto, { updatedBy: user.id });
    return this.fleetsRepository.save(fleet);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const fleet = await this.findOne(id);
    fleet.deletedBy = user.id;
    await this.fleetsRepository.save(fleet);
    return this.fleetsRepository.softDelete(id);
  }

  private async assertCodeAvailable(code: string) {
    const existing = await this.fleetsRepository.findOne({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Ya existe una flota con código ${code}.`);
    }
  }
}
