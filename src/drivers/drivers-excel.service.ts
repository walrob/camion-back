import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Driver } from './entities/driver.entity';
import { Employee } from 'src/hr/entities/employee.entity';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import {
  assertExportSize,
  buildImportTemplate,
  buildXlsx,
  cell,
  dateCell,
  ExcelRow,
  ImportColumn,
  ImportResult,
  runExcelImport,
} from 'src/common/excel';

/** Idénticas a las del front (`useFleetStatus.ts`). */
const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  [DriverStatus.ACTIVE]: 'Activo',
  [DriverStatus.ON_TRIP]: 'En viaje',
  [DriverStatus.INACTIVE]: 'Inactivo',
};

export interface DriverExportFilters {
  search?: string;
  status?: DriverStatus;
}

@Injectable()
export class DriversExcelService {
  constructor(
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,
  ) {}

  private columns(): ImportColumn[] {
    return [
      {
        header: 'DNI',
        field: 'documentId',
        aliases: ['Documento'],
        required: true,
        parse: cell.text(30),
        hint: 'Documento del chofer. Identifica la fila: si ya existe, se actualiza.',
        example: '30111222',
      },
      {
        header: 'Apellido',
        field: 'lastName',
        parse: cell.text(80),
        hint: 'Solo se usa si el legajo todavía no existe y hay que crearlo.',
        example: 'Gómez',
      },
      {
        header: 'Nombre',
        field: 'firstName',
        parse: cell.text(80),
        hint: 'Solo se usa si el legajo todavía no existe y hay que crearlo.',
        example: 'Juan',
      },
      {
        header: 'Telefono',
        field: 'phone',
        aliases: ['Teléfono'],
        parse: cell.text(40),
        hint: 'Solo se usa si el legajo todavía no existe y hay que crearlo.',
        example: '3411234567',
      },
      {
        header: 'Nro licencia',
        field: 'licenseNumber',
        aliases: ['N° licencia', 'Numero licencia', 'Licencia'],
        parse: cell.text(80),
        example: 'LIC-99887',
      },
      {
        header: 'Tipo licencia',
        field: 'licenseType',
        aliases: ['Clase licencia'],
        parse: cell.text(40),
        hint: 'Clase o categoría de la licencia.',
        example: 'E1',
      },
      {
        header: 'Vencimiento licencia',
        field: 'licenseExpiry',
        aliases: ['Vence licencia'],
        parse: cell.date(),
        example: '01/02/2027',
      },
      {
        header: 'Estado',
        field: 'status',
        parse: cell.enumLabel<DriverStatus>(DRIVER_STATUS_LABELS),
        hint: `Uno de: ${Object.values(DRIVER_STATUS_LABELS).join(', ')}. Vacío = Activo.`,
        example: 'Activo',
      },
      {
        header: 'Notas',
        field: 'notes',
        parse: cell.text(500),
        example: '',
      },
    ];
  }

  /**
   * El listado busca por campos del legajo (`employee.*`), así que el filtro se
   * arma sobre la relación para que el Excel traiga las mismas filas que la
   * tabla.
   */
  private where(filters: DriverExportFilters): FindOptionsWhere<Driver>[] {
    const base: FindOptionsWhere<Driver> = {
      ...(filters.status && { status: filters.status }),
    };
    if (!filters.search) return [base];
    const like = ILike(`%${filters.search}%`);
    return [
      { ...base, employee: { firstName: like } },
      { ...base, employee: { lastName: like } },
      { ...base, employee: { documentId: like } },
      { ...base, licenseNumber: like },
    ];
  }

  async export(filters: DriverExportFilters): Promise<Buffer> {
    const where = this.where(filters);
    assertExportSize(await this.driversRepository.count({ where }));

    const drivers = await this.driversRepository.find({
      where,
      relations: ['employee', 'employee.user'],
      order: { employee: { lastName: 'ASC', firstName: 'ASC' } },
    });

    const columns = [
      'DNI',
      'Apellido',
      'Nombre',
      'Telefono',
      'Email',
      'Nro licencia',
      'Tipo licencia',
      'Vencimiento licencia',
      'Estado',
      'Notas',
    ];

    const rows: ExcelRow[] = drivers.map((d) => ({
      DNI: d.employee?.documentId ?? '',
      Apellido: d.employee?.lastName ?? '',
      Nombre: d.employee?.firstName ?? '',
      Telefono: d.employee?.phone ?? '',
      Email: d.employee?.user?.email ?? '',
      'Nro licencia': d.licenseNumber ?? '',
      'Tipo licencia': d.licenseType ?? '',
      'Vencimiento licencia': dateCell(d.licenseExpiry),
      Estado: DRIVER_STATUS_LABELS[d.status] ?? d.status,
      Notas: d.notes ?? '',
    }));

    return buildXlsx('Choferes', columns, rows);
  }

  template(): Buffer {
    return buildImportTemplate('Choferes', this.columns());
  }

  /**
   * Carga de choferes.
   *
   * Un chofer es una capacidad del legajo, no una entidad suelta: si el DNI no
   * tiene legajo, la planilla lo crea con puesto Chofer. Exigir cargar primero
   * RRHH obligaría a subir dos planillas para el caso más común, que es el
   * arranque con el sistema vacío.
   */
  async import(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    return runExcelImport<any>({
      buffer,
      dryRun,
      columns: this.columns(),
      key: (row) => row.documentId,
      validate: (row) => {
        if (!row.firstName || !row.lastName) {
          // Sólo hace falta cuando hay que crear el legajo, pero pedirlo
          // siempre evita una planilla que funciona o no según qué DNI toque.
          return 'Falta Nombre o Apellido: hacen falta por si el legajo no existe todavía.';
        }
      },
      find: async (documentId) => {
        const employee = await this.employeesRepository.findOne({
          where: { documentId },
        });
        if (!employee) return null;
        return this.driversRepository.findOne({
          where: { employeeId: employee.id },
        });
      },
      create: async (row) => {
        const { documentId, firstName, lastName, phone, ...driverData } = row;

        let employee = await this.employeesRepository.findOne({
          where: { documentId },
        });
        if (!employee) {
          employee = await this.employeesRepository.save(
            this.employeesRepository.create({
              documentId,
              firstName,
              lastName,
              phone,
              position: EmployeePosition.DRIVER,
              createdBy: user.id,
            }),
          );
        }

        return this.driversRepository.save(
          this.driversRepository.create({
            employeeId: employee.id,
            status: DriverStatus.ACTIVE,
            ...driverData,
            createdBy: user.id,
          }),
        );
      },
      update: async (existing: Driver, row) => {
        const { documentId, firstName, lastName, phone, ...driverData } = row;
        Object.assign(existing, driverData, { updatedBy: user.id });
        return this.driversRepository.save(existing);
      },
    });
  }
}
