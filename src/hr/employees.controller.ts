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
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CertificationsService } from './certifications.service';
import { AssignmentsService } from './assignments.service';
import { EmploymentMovementsService } from './employment-movements.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('HR - Employees')
@ApiBearerAuth()
@Controller('hr/employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly certificationsService: CertificationsService,
    private readonly assignmentsService: AssignmentsService,
    private readonly movementsService: EmploymentMovementsService,
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
