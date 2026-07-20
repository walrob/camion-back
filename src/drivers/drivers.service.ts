import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Driver } from './entities/driver.entity';
import { Employee } from 'src/hr/entities/employee.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';
import { resolveSort } from 'src/common/utils/resolve-sort.util';

// Columnas ordenables (clave del front → columna/alias real).
const DRIVER_SORTABLE: Record<string, string> = {
  'employee.documentId': 'employee.documentId',
  licenseNumber: 'licenseNumber',
  licenseExpiry: 'licenseExpiry',
  'employee.phone': 'employee.phone',
  status: 'status',
  createdAt: 'createdAt',
};

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,
  ) {}

  /**
   * Crea el perfil de conducción a partir de un Employee existente. No crea
   * User ni datos personales: el legajo es la fuente de verdad. Relación 1:1.
   */
  async create(dto: CreateDriverDto, user: ActiveUserInterface): Promise<Driver> {
    const employee = await this.employeesRepository.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException(
        `No existe un empleado con id ${dto.employeeId}.`,
      );
    }

    const existing = await this.driversRepository.findOne({
      where: { employeeId: dto.employeeId },
    });
    if (existing) {
      throw new ConflictException(
        'Este empleado ya tiene un perfil de chofer asociado.',
      );
    }

    const driver = this.driversRepository.create({
      employeeId: dto.employeeId,
      licenseNumber: dto.licenseNumber,
      licenseType: dto.licenseType,
      licenseExpiry: dto.licenseExpiry,
      status: dto.status ?? DriverStatus.ACTIVE,
      notes: dto.notes,
      createdBy: user.id,
    });

    const saved = await this.driversRepository.save(driver);
    return this.findOne(saved.id);
  }

  paginate(
    options: IPaginationOptions,
    search?: string,
    status?: DriverStatus,
    sortBy?: string,
    order?: string,
  ): Promise<Pagination<Driver>> {
    const sort = resolveSort(sortBy, order, DRIVER_SORTABLE, {
      orderBy: 'employee.lastName',
      order: 'ASC',
    });
    return paginateAndSearch<Driver>(this.driversRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search,
      // La búsqueda por nombre/documento se resuelve vía la relación Employee.
      searchFields: [
        'employee.firstName',
        'employee.lastName',
        'employee.documentId',
        'licenseNumber',
      ],
      orderBy: sort.orderBy,
      order: sort.order,
      relations: ['employee', 'employee.user'],
      baseWhere: {
        ...(status && { status }),
      },
    });
  }

  async findOne(id: string): Promise<Driver> {
    const driver = await this.driversRepository.findOne({
      where: { id },
      relations: ['employee', 'employee.user'],
    });
    if (!driver) throw new NotFoundException('Chofer no encontrado.');
    return driver;
  }

  /** Carga varios choferes por id con su legajo y usuario (para enriquecer listados). */
  findByIds(ids: string[]): Promise<Driver[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.driversRepository.find({
      where: { id: In(ids) },
      relations: ['employee', 'employee.user'],
    });
  }

  /** Resuelve el Driver del usuario logueado a través de Employee.userId. */
  async findByUserId(userId: string): Promise<Driver> {
    const driver = await this.driversRepository
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.userId = :userId', { userId })
      .getOne();
    if (!driver) throw new NotFoundException('Perfil de chofer no encontrado.');
    return driver;
  }

  /** Solo campos operativos; los datos personales se editan en Employee. */
  async update(
    id: string,
    dto: UpdateDriverDto,
    user: ActiveUserInterface,
  ): Promise<Driver> {
    const driver = await this.findOne(id);
    Object.assign(driver, dto, { updatedBy: user.id });
    await this.driversRepository.save(driver);
    return this.findOne(id);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const driver = await this.findOne(id);
    driver.deletedBy = user.id;
    await this.driversRepository.save(driver);
    return this.driversRepository.softDelete(id);
  }
}
