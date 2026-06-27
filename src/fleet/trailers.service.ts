import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Trailer } from './entities/trailer.entity';
import { CreateTrailerDto } from './dto/create-trailer.dto';
import { UpdateTrailerDto } from './dto/update-trailer.dto';
import { TrailerStatus } from 'src/common/enums/trailerStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';

@Injectable()
export class TrailersService {
  constructor(
    @InjectRepository(Trailer)
    private readonly trailersRepository: Repository<Trailer>,
  ) {}

  async create(
    dto: CreateTrailerDto,
    user: ActiveUserInterface,
  ): Promise<Trailer> {
    await this.assertPlateAvailable(dto.plate);
    const trailer = this.trailersRepository.create({
      ...dto,
      createdBy: user.id,
    });
    return this.trailersRepository.save(trailer);
  }

  paginate(
    options: IPaginationOptions,
    search?: string,
    status?: TrailerStatus,
  ): Promise<Pagination<Trailer>> {
    return paginateAndSearch<Trailer>(this.trailersRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search,
      searchFields: ['plate', 'type'],
      orderBy: 'plate',
      order: 'ASC',
      baseWhere: {
        ...(status && { status }),
      },
    });
  }

  async findOne(id: string): Promise<Trailer> {
    const trailer = await this.trailersRepository.findOne({ where: { id } });
    if (!trailer) throw new NotFoundException('Acoplado no encontrado.');
    return trailer;
  }

  async update(
    id: string,
    dto: UpdateTrailerDto,
    user: ActiveUserInterface,
  ): Promise<Trailer> {
    const trailer = await this.findOne(id);
    if (dto.plate && dto.plate !== trailer.plate) {
      await this.assertPlateAvailable(dto.plate);
    }
    Object.assign(trailer, dto, { updatedBy: user.id });
    return this.trailersRepository.save(trailer);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const trailer = await this.findOne(id);
    trailer.deletedBy = user.id;
    await this.trailersRepository.save(trailer);
    return this.trailersRepository.softDelete(id);
  }

  private async assertPlateAvailable(plate: string) {
    const existing = await this.trailersRepository.findOne({
      where: { plate },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un acoplado con patente ${plate}.`,
      );
    }
  }
}
