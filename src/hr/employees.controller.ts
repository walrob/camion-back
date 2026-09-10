import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { HrExcelService } from './hr-excel.service';
import { CertificationsService } from './certifications.service';
import { AssignmentsService } from './assignments.service';
import { EmploymentMovementsService } from './employment-movements.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('HR - Employees')
@ApiBearerAuth()
@RequiresFeature(Feature.HR_BASIC)
@Controller('hr/employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly certificationsService: CertificationsService,
    private readonly assignmentsService: AssignmentsService,
    private readonly movementsService: EmploymentMovementsService,
    private readonly hrExcelService: HrExcelService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.HR)
  create(
    @Body() dto: CreateEmployeeDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.employeesService.create(dto, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'position', required: false, enum: EmployeePosition })
  @ApiQuery({ name: 'employmentStatus', required: false, enum: EmploymentStatus })
  @ApiQuery({ name: 'withoutDriver', required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
    @Query('position') position?: EmployeePosition,
    @Query('employmentStatus') employmentStatus?: EmploymentStatus,
    @Query('withoutDriver') withoutDriver?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.employeesService.paginate(
      { page, limit },
      search,
      position,
      employmentStatus,
      withoutDriver === 'true',
      sortBy,
      order,
    );
  }

  // Descarga el listado con los mismos filtros que la tabla, sin paginar.
  // Va antes de @Get(':id'): Nest resuelve por orden de declaracion.
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'position', required: false })
  @ApiQuery({ name: 'employmentStatus', required: false, enum: EmploymentStatus })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('position') position?: string,
    @Query('employmentStatus') employmentStatus?: EmploymentStatus,
  ): Promise<StreamableFile> {
    const buffer = await this.hrExcelService.exportEmployees({
      search,
      position,
      employmentStatus,
    });
    return sendXlsx(res, 'empleados.xlsx', buffer);
  }

  @Get('import/template')
  @Auth(Role.ADMIN, Role.HR)
  async template(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendXlsx(
      res,
      'plantilla-empleados.xlsx',
      await this.hrExcelService.employeeTemplate(),
    );
  }

  @Post('import')
  @Auth(Role.ADMIN, Role.HR)
  @ExcelImport()
  import(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.hrExcelService.importEmployees(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Get(':id/certifications')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  certifications(@Param('id') id: string) {
    return this.certificationsService.listByEmployee(id);
  }

  @Get(':id/assignments')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  assignments(@Param('id') id: string) {
    return this.assignmentsService.historyByEmployee(id);
  }

  /** Historial laboral: ingreso, licencias, suspensiones y baja. */
  @Get(':id/movements')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER)
  movements(@Param('id') id: string) {
    return this.movementsService.listByEmployee(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.HR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.employeesService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.HR)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.employeesService.remove(id, user);
  }
}
