import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Employee } from './entities/employee.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,
  ) {}

  async create(
    dto: CreateEmployeeDto,
    user: ActiveUserInterface,
  ): Promise<Employee> {
    await this.assertDocumentAvailable(dto.documentId);
    const employee = this.employeesRepository.create({
      ...dto,
      createdBy: user.id,
    });
    return this.employeesRepository.save(employee);
  }

  paginate(
    options: IPaginationOptions,
    search?: string,
    position?: EmployeePosition,
    employmentStatus?: EmploymentStatus,
    withoutDriver?: boolean,
  ): Promise<Pagination<Employee>> {
    // Para el selector del alta de chofer: excluir empleados que ya tienen Driver.
    if (withoutDriver) {
      return this.paginateWithoutDriver(
        options,
        search,
        position,
        employmentStatus,
      );
    }

    return paginateAndSearch<Employee>(this.employeesRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search,
      searchFields: ['firstName', 'lastName', 'documentId', 'phone'],
      orderBy: 'lastName',
      order: 'ASC',
      baseWhere: {
        ...(position && { position }),
        ...(employmentStatus && { employmentStatus }),
      },
    });
  }

  /** Empleados que aún NO tienen un perfil de chofer (Driver) asociado. */
  private async paginateWithoutDriver(
    options: IPaginationOptions,
    search?: string,
    position?: EmployeePosition,
    employmentStatus?: EmploymentStatus,
  ): Promise<Pagination<Employee>> {
    const page = Number(options.page);
    const limit = Number(options.limit);

    const qb = this.employeesRepository
      .createQueryBuilder('employee')
      .leftJoin(
        Driver,
        'drv',
        'drv.employeeId = employee.id AND drv.deletedAt IS NULL',
      )
      .where('drv.id IS NULL')
      .orderBy('employee.lastName', 'ASC');

    if (position) qb.andWhere('employee.position = :position', { position });
    if (employmentStatus) {
      qb.andWhere('employee.employmentStatus = :employmentStatus', {
        employmentStatus,
      });
    }
    if (search) {
      qb.andWhere(
        '(LOWER(employee.firstName) LIKE LOWER(:s) OR LOWER(employee.lastName) LIKE LOWER(:s) OR LOWER(employee.documentId) LIKE LOWER(:s) OR LOWER(employee.phone) LIKE LOWER(:s))',
        { s: `%${search}%` },
      );
    }

    const total = await qb.getCount();
    const items = await qb.take(limit).skip((page - 1) * limit).getMany();

    return {
      items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    } as Pagination<Employee>;
  }

  async findOne(id: string): Promise<Employee> {
    const employee = await this.employeesRepository.findOne({
      where: { id },
      relations: ['certifications', 'assignments', 'assignments.truck'],
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado.');
    return employee;
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    user: ActiveUserInterface,
  ): Promise<Employee> {
    const employee = await this.findOne(id);
    if (dto.documentId && dto.documentId !== employee.documentId) {
      await this.assertDocumentAvailable(dto.documentId);
    }
    Object.assign(employee, dto, { updatedBy: user.id });
    return this.employeesRepository.save(employee);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const employee = await this.findOne(id);
    employee.deletedBy = user.id;
    await this.employeesRepository.save(employee);
    return this.employeesRepository.softDelete(id);
  }

  private async assertDocumentAvailable(documentId: string) {
    const existing = await this.employeesRepository.findOne({
      where: { documentId },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un empleado con documento ${documentId}.`,
      );
    }
  }
}
