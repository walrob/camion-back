import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcryptjs from 'bcryptjs';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Driver } from './entities/driver.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { UsersService } from 'src/users/users.service';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateDriverDto, user: ActiveUserInterface): Promise<Driver> {
    const existing = await this.usersService.findOneByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Ya existe un usuario con este email.');
    }

    const newUser = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: await bcryptjs.hash(dto.password, 10),
      isEmailVerified: true,
      role: Role.DRIVER,
      phone: dto.phone,
    });

    const driver = this.driversRepository.create({
      userId: newUser.id,
      licenseNumber: dto.licenseNumber,
      licenseType: dto.licenseType,
      licenseExpiry: dto.licenseExpiry,
      phone: dto.phone,
      status: dto.status ?? DriverStatus.ACTIVE,
      notes: dto.notes,
      createdBy: user.id,
    });

    return this.driversRepository.save(driver);
  }

  paginate(
    options: IPaginationOptions,
    search?: string,
    status?: DriverStatus,
  ): Promise<Pagination<Driver>> {
    return paginateAndSearch<Driver>(this.driversRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search,
      searchFields: ['licenseNumber', 'phone', 'user.name', 'user.email'],
      orderBy: 'user.name',
      order: 'ASC',
      relations: ['user'],
      baseWhere: {
        ...(status && { status }),
      },
    });
  }

  async findOne(id: string): Promise<Driver> {
    const driver = await this.driversRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!driver) throw new NotFoundException('Chofer no encontrado.');
    return driver;
  }

  async findByUserId(userId: string): Promise<Driver> {
    const driver = await this.driversRepository.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (!driver) throw new NotFoundException('Perfil de chofer no encontrado.');
    return driver;
  }

  async update(
    id: string,
    dto: UpdateDriverDto,
    user: ActiveUserInterface,
  ): Promise<Driver> {
    const driver = await this.findOne(id);
    Object.assign(driver, dto, { updatedBy: user.id });
    return this.driversRepository.save(driver);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const driver = await this.findOne(id);
    driver.deletedBy = user.id;
    await this.driversRepository.save(driver);
    return this.driversRepository.softDelete(id);
  }
}
