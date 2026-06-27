import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('HR - Assignments')
@ApiBearerAuth()
@Controller('hr/assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @Auth(Role.ADMIN, Role.HR, Role.DISPATCHER)
  assign(
    @Body() dto: CreateAssignmentDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.assignmentsService.assign(dto, user);
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
