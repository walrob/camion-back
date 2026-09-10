import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, IsNull, Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Certification } from './entities/certification.entity';
import { TruckAssignment } from './entities/truck-assignment.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { EmployeesService } from './employees.service';
import { CertificationsService } from './certifications.service';
import { AssignmentsService } from './assignments.service';
import { CatalogsService } from 'src/catalogs/catalogs.service';
import { CATALOG } from 'src/catalogs/catalogs.catalog';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { CertificationStatus } from 'src/common/enums/certificationStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import {
  assertExportSize,
  boolCell,
  buildImportTemplate,
  buildXlsx,
  cell,
  dateCell,
  dateTimeCell,
  ExcelRow,
  ImportColumn,
  ImportResult,
  runExcelImport,
} from 'src/common/excel';

/** Estados del legajo: los define la máquina de estados, no la empresa. */
const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  [EmploymentStatus.ACTIVE]: 'Activo',
  [EmploymentStatus.ON_LEAVE]: 'Licencia',
  [EmploymentStatus.SUSPENDED]: 'Suspendido',
  [EmploymentStatus.TERMINATED]: 'Baja',
};

const CERT_STATUS_LABELS: Record<CertificationStatus, string> = {
  [CertificationStatus.VALID]: 'Vigente',
  [CertificationStatus.EXPIRING]: 'Por vencer',
  [CertificationStatus.EXPIRED]: 'Vencido',
};

export interface EmployeeExportFilters {
  search?: string;
  position?: string;
  employmentStatus?: EmploymentStatus;
}

interface EmployeeCtx {
  posiciones: Record<string, string>;
}

interface CertCtx {
  empleados: Map<string, string>;
  tipos: Record<string, string>;
}

interface AssignmentCtx {
  empleados: Map<string, string>;
  camiones: Map<string, string>;
}

@Injectable()
export class HrExcelService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,
    @InjectRepository(Certification)
    private readonly certificationsRepository: Repository<Certification>,
    @InjectRepository(TruckAssignment)
    private readonly assignmentsRepository: Repository<TruckAssignment>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    private readonly employeesService: EmployeesService,
    private readonly certificationsService: CertificationsService,
    private readonly assignmentsService: AssignmentsService,
    private readonly catalogsService: CatalogsService,
  ) {}

  /** Índice DNI → id de legajo, para resolver las referencias de las planillas. */
  private async employeeIndex(): Promise<Map<string, string>> {
    const employees = await this.employeesRepository.find();
    return cell.indexBy(
      employees,
      (e) => e.documentId,
      (e) => e.id,
    );
  }

  private nombre(e?: Employee | null): string {
    if (!e) return '';
    return `${e.lastName ?? ''}, ${e.firstName ?? ''}`.replace(/^, |, $/g, '');
  }

  // ───────────────────────── Legajos ─────────────────────────

  private employeeColumns(ctx: EmployeeCtx): ImportColumn<EmployeeCtx>[] {
    return [
      {
        header: 'DNI',
        field: 'documentId',
        aliases: ['Documento', 'Nro documento'],
        required: true,
        parse: cell.text(30),
        hint: 'Documento del empleado. Identifica la fila: si ya existe, se actualiza.',
        example: '30111222',
      },
      {
        header: 'Apellido',
        field: 'lastName',
        required: true,
        parse: cell.text(80),
        example: 'Gómez',
      },
      {
        header: 'Nombre',
        field: 'firstName',
        required: true,
        parse: cell.text(80),
        example: 'Juan',
      },
      {
        header: 'Puesto',
        field: 'position',
        parse: cell.enumLabel(ctx.posiciones),
        hint: `Uno de: ${Object.values(ctx.posiciones).join(', ')}. Vacío = Chofer.`,
        example: Object.values(ctx.posiciones)[0] ?? 'Chofer',
      },
      {
        header: 'Fecha de ingreso',
        field: 'hireDate',
        parse: cell.date(),
        hint: 'Abre el historial laboral con el movimiento de alta.',
        example: '01/03/2024',
      },
      {
        header: 'Fecha de nacimiento',
        field: 'birthDate',
        parse: cell.date(),
        example: '15/06/1985',
      },
      {
        header: 'Telefono',
        field: 'phone',
        aliases: ['Teléfono'],
        parse: cell.text(40),
        example: '3411234567',
      },
      {
        header: 'Direccion',
        field: 'address',
        aliases: ['Dirección'],
        parse: cell.text(200),
        example: 'San Martín 1234',
      },
      {
        header: 'Contacto de emergencia',
        field: 'emergencyContactName',
        parse: cell.text(120),
        example: 'María Gómez',
      },
      {
        header: 'Telefono de emergencia',
        field: 'emergencyContactPhone',
        aliases: ['Teléfono de emergencia'],
        parse: cell.text(40),
        example: '3417654321',
      },
      {
        header: 'Notas',
        field: 'notes',
        parse: cell.text(500),
        example: '',
      },
    ];
  }

  private employeeWhere(
    filters: EmployeeExportFilters,
  ): FindOptionsWhere<Employee>[] {
    const base: FindOptionsWhere<Employee> = {
      ...(filters.position && { position: filters.position }),
      ...(filters.employmentStatus && {
        employmentStatus: filters.employmentStatus,
      }),
    };
    if (!filters.search) return [base];
    return ['firstName', 'lastName', 'documentId', 'phone'].map((field) => ({
      ...base,
      [field]: ILike(`%${filters.search}%`),
    }));
  }

  async exportEmployees(filters: EmployeeExportFilters): Promise<Buffer> {
    const where = this.employeeWhere(filters);
    assertExportSize(await this.employeesRepository.count({ where }));

    const [employees, posiciones] = await Promise.all([
      this.employeesRepository.find({
        where,
        relations: ['user'],
        order: { lastName: 'ASC', firstName: 'ASC' },
      }),
      this.catalogsService.etiquetas(CATALOG.EMPLOYEE_POSITION),
    ]);

    const columns = [
      'DNI',
      'Apellido',
      'Nombre',
      'Puesto',
      'Estado',
      'Fecha de ingreso',
      'Fecha de baja',
      'Fecha de nacimiento',
      'Telefono',
      'Email',
      'Direccion',
      'Contacto de emergencia',
      'Telefono de emergencia',
      'Notas',
    ];

    const rows: ExcelRow[] = employees.map((e) => ({
      DNI: e.documentId,
      Apellido: e.lastName,
      Nombre: e.firstName,
      Puesto: posiciones[e.position] ?? e.position ?? '',
      Estado:
        EMPLOYMENT_STATUS_LABELS[e.employmentStatus] ?? e.employmentStatus,
      'Fecha de ingreso': dateCell(e.hireDate),
      'Fecha de baja': dateCell(e.terminationDate),
      'Fecha de nacimiento': dateCell(e.birthDate),
      Telefono: e.phone ?? '',
      Email: e.user?.email ?? '',
      Direccion: e.address ?? '',
      'Contacto de emergencia': e.emergencyContactName ?? '',
      'Telefono de emergencia': e.emergencyContactPhone ?? '',
      Notas: e.notes ?? '',
    }));

    return buildXlsx('Empleados', columns, rows);
  }

  async employeeTemplate(): Promise<Buffer> {
    const posiciones = await this.catalogsService.etiquetas(
      CATALOG.EMPLOYEE_POSITION,
    );
    return buildImportTemplate(
      'Empleados',
      this.employeeColumns({ posiciones }),
    );
  }

  async importEmployees(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const posiciones = await this.catalogsService.etiquetas(
      CATALOG.EMPLOYEE_POSITION,
    );
    const ctx: EmployeeCtx = { posiciones };

    return runExcelImport<any, EmployeeCtx>({
      buffer,
      dryRun,
      columns: this.employeeColumns(ctx),
      ctx,
      key: (row) => row.documentId,
      find: (documentId) =>
        this.employeesRepository.findOne({ where: { documentId } }),
      // El alta pasa por el servicio y no por el repositorio: así valida el
      // puesto contra el catálogo y abre el historial laboral con el
      // movimiento de ingreso. La planilla nunca crea cuentas de acceso —eso
      // exige contraseña y se invita aparte—, sólo el legajo.
      create: (row) => this.employeesService.create(row, user),
      update: (existing: Employee, row) =>
        this.employeesService.update(existing.id, row, user),
    });
  }

  // ───────────────────── Permisos y certificaciones ─────────────────────

  private certColumns(ctx: CertCtx): ImportColumn<CertCtx>[] {
    return [
      {
        header: 'DNI',
        field: 'employeeId',
        aliases: ['Documento', 'DNI empleado'],
        required: true,
        parse: cell.lookup<CertCtx>((c) => c.empleados, 'el empleado'),
        hint: 'Documento de un empleado ya cargado. Cargá primero los legajos.',
        example: '30111222',
      },
      {
        header: 'Tipo',
        field: 'type',
        required: true,
        parse: cell.enumLabel(ctx.tipos),
        hint: `Uno de: ${Object.values(ctx.tipos).join(', ')}.`,
        example: Object.values(ctx.tipos)[0] ?? 'Carnet de conducir',
      },
      {
        header: 'Clase',
        field: 'class',
        parse: cell.text(40),
        hint: 'Clase o categoría del permiso.',
        example: 'E1',
      },
      {
        header: 'Numero',
        field: 'number',
        aliases: ['Número'],
        parse: cell.text(80),
        example: 'LIC-99887',
      },
      {
        header: 'Otorgado por',
        field: 'issuedBy',
        parse: cell.text(120),
        example: 'Municipalidad de Rosario',
      },
      {
        header: 'Emision',
        field: 'issueDate',
        aliases: ['Emisión', 'Fecha de emision'],
        parse: cell.date(),
        example: '01/02/2024',
      },
      {
        header: 'Vencimiento',
        field: 'expiryDate',
        aliases: ['Fecha de vencimiento'],
        parse: cell.date(),
        hint: 'De acá sale el estado (vigente / por vencer / vencido) y los avisos.',
        example: '01/02/2027',
      },
      {
        header: 'Notas',
        field: 'notes',
        parse: cell.text(500),
        example: '',
      },
    ];
  }

  private async certCtx(): Promise<CertCtx> {
    const [empleados, tipos] = await Promise.all([
      this.employeeIndex(),
      this.catalogsService.etiquetas(CATALOG.CERTIFICATION_TYPE),
    ]);
    return { empleados, tipos };
  }

  /** `employeeId` opcional: la tabla del legajo exporta sólo ese empleado. */
  async exportCertifications(employeeId?: string): Promise<Buffer> {
    const where: FindOptionsWhere<Certification> = {
      ...(employeeId && { employeeId }),
    };
    assertExportSize(await this.certificationsRepository.count({ where }));

    const [certs, tipos] = await Promise.all([
      this.certificationsRepository.find({
        where,
        relations: ['employee'],
        order: { expiryDate: 'ASC' },
      }),
      this.catalogsService.etiquetas(CATALOG.CERTIFICATION_TYPE),
    ]);

    const columns = [
      'DNI',
      'Empleado',
      'Tipo',
      'Clase',
      'Numero',
      'Otorgado por',
      'Emision',
      'Vencimiento',
      'Estado',
      'Notas',
    ];

    const rows: ExcelRow[] = certs.map((c) => ({
      DNI: c.employee?.documentId ?? '',
      Empleado: this.nombre(c.employee),
      Tipo: tipos[c.type] ?? c.type,
      Clase: c.class ?? '',
      Numero: c.number ?? '',
      'Otorgado por': c.issuedBy ?? '',
      Emision: dateCell(c.issueDate),
      Vencimiento: dateCell(c.expiryDate),
      Estado: CERT_STATUS_LABELS[c.status] ?? c.status,
      Notas: c.notes ?? '',
    }));

    return buildXlsx('Permisos', columns, rows);
  }

  async certificationTemplate(): Promise<Buffer> {
    return buildImportTemplate('Permisos', this.certColumns(await this.certCtx()));
  }

  async importCertifications(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const ctx = await this.certCtx();
    return runExcelImport<any, CertCtx>({
      buffer,
      dryRun,
      columns: this.certColumns(ctx),
      ctx,
      // Un permiso por empleado y tipo: la renovación actualiza el vencimiento
      // en lugar de apilar una fila nueva cada vez que se sube la planilla.
      key: (row) => `${row.employeeId}|${row.type}`,
      find: async (key) => {
        const [employeeId, type] = key.split('|');
        return this.certificationsRepository.findOne({
          where: { employeeId, type },
        });
      },
      // Vía servicio: valida el tipo contra el catálogo y recalcula el estado
      // según la ventana de aviso configurada.
      create: (row) => this.certificationsService.create(row, undefined, user),
      update: (existing: Certification, row) =>
        this.certificationsService.update(existing.id, row, undefined, user),
    });
  }

  // ───────────────────────── Asignaciones ─────────────────────────

  private assignmentColumns(): ImportColumn<AssignmentCtx>[] {
    return [
      {
        header: 'DNI',
        field: 'employeeId',
        aliases: ['Documento', 'DNI empleado'],
        required: true,
        parse: cell.lookup<AssignmentCtx>((c) => c.empleados, 'el empleado'),
        hint: 'Documento de un empleado ya cargado.',
        example: '30111222',
      },
      {
        header: 'Patente',
        field: 'truckId',
        aliases: ['Patente camion', 'Camion'],
        required: true,
        parse: cell.lookup<AssignmentCtx>((c) => c.camiones, 'el camión'),
        hint: 'Patente de un camión ya cargado.',
        example: 'AB123CD',
      },
      {
        header: 'Principal',
        field: 'isPrimary',
        parse: cell.bool(),
        hint: 'Sí o No. Vacío = Sí. La asignación principal cierra la anterior del mismo camión y del mismo chofer.',
        example: 'Sí',
      },
      {
        header: 'Notas',
        field: 'notes',
        parse: cell.text(500),
        example: '',
      },
    ];
  }

  private async assignmentCtx(): Promise<AssignmentCtx> {
    const [empleados, trucks] = await Promise.all([
      this.employeeIndex(),
      this.trucksRepository.find(),
    ]);
    return {
      empleados,
      camiones: cell.indexBy(
        trucks,
        (t) => t.plate,
        (t) => t.id,
      ),
    };
  }

  async exportAssignments(employeeId?: string): Promise<Buffer> {
    const where: FindOptionsWhere<TruckAssignment> = {
      ...(employeeId && { employeeId }),
    };
    assertExportSize(await this.assignmentsRepository.count({ where }));

    const assignments = await this.assignmentsRepository.find({
      where,
      relations: ['employee', 'truck'],
      order: { assignedAt: 'DESC' },
    });

    const columns = [
      'DNI',
      'Empleado',
      'Patente',
      'Principal',
      'Desde',
      'Hasta',
      'Notas',
    ];

    const rows: ExcelRow[] = assignments.map((a) => ({
      DNI: a.employee?.documentId ?? '',
      Empleado: this.nombre(a.employee),
      Patente: a.truck?.plate ?? '',
      Principal: boolCell(a.isPrimary),
      Desde: dateTimeCell(a.assignedAt),
      Hasta: dateTimeCell(a.unassignedAt),
      Notas: a.notes ?? '',
    }));

    return buildXlsx('Asignaciones', columns, rows);
  }

  assignmentTemplate(): Buffer {
    return buildImportTemplate('Asignaciones', this.assignmentColumns());
  }

  async importAssignments(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const ctx = await this.assignmentCtx();
    return runExcelImport<any, AssignmentCtx>({
      buffer,
      dryRun,
      columns: this.assignmentColumns(),
      ctx,
      key: (row) => `${row.employeeId}|${row.truckId}`,
      // Sólo cuenta la asignación abierta: una que ya se cerró es historia y
      // volver a asignar la misma dupla es un alta nueva, no una edición.
      find: async (key) => {
        const [employeeId, truckId] = key.split('|');
        return this.assignmentsRepository.findOne({
          where: { employeeId, truckId, unassignedAt: IsNull() },
        });
      },
      create: (row) => this.assignmentsService.assign(row, user),
      // Sin `update`: la dupla ya vigente se cuenta como omitida en lugar de
      // cerrarse y reabrirse, que cortaría el historial sin motivo.
    });
  }
}
