import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AssignmentsService } from './assignments.service';
import { HrExcelService } from './hr-excel.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('HR - Assignments')
@ApiBearerAuth()
@RequiresFeature(Feature.HR_BASIC)
@Controller('hr/assignments')
export class AssignmentsController {
  constructor(
    private readonly assignmentsService: AssignmentsService,
    private readonly hrExcelService: HrExcelService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.HR, Role.DISPATCHER)
  assign(
    @Body() dto: CreateAssignmentDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.assignmentsService.assign(dto, user);
  }

  // Sin employeeId baja el historial completo; con employeeId, el del legajo
  // abierto (que es como lo usa la tabla de la ficha del empleado).
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  @ApiQuery({ name: 'employeeId', required: false })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('employeeId') employeeId?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.hrExcelService.exportAssignments(employeeId);
    return sendXlsx(res, 'asignaciones.xlsx', buffer);
  }

  @Get('import/template')
  @Auth(Role.ADMIN, Role.HR, Role.DISPATCHER)
  template(@Res({ passthrough: true }) res: Response): StreamableFile {
    return sendXlsx(
      res,
      'plantilla-asignaciones.xlsx',
      this.hrExcelService.assignmentTemplate(),
    );
  }

  @Post('import')
  @Auth(Role.ADMIN, Role.HR, Role.DISPATCHER)
  @ExcelImport()
  import(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.hrExcelService.importAssignments(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  @Get('truck/:truckId/current')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  currentByTruck(@Param('truckId') truckId: string) {
    return this.assignmentsService.currentByTruck(truckId);
  }

  @Get('employee/:employeeId/current')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  currentByEmployee(@Param('employeeId') employeeId: string) {
    return this.assignmentsService.currentByEmployee(employeeId);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.HR, Role.DISPATCHER)
  unassign(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.assignmentsService.unassign(id, user);
  }
}
