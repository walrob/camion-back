import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { AssignIncidentDto } from './dto/assign-incident.dto';
import { ChangeIncidentStatusDto } from './dto/change-status.dto';
import { CommentIncidentDto } from './dto/comment-incident.dto';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from 'src/common/enums/incident.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @Auth(Role.DRIVER)
  create(
    @Body() dto: CreateIncidentDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.incidentsService.create(dto, user);
  }

  @Get('me')
  @Auth(Role.DRIVER)
  findMine(@ActiveUser() user: ActiveUserInterface) {
    return this.incidentsService.findMine(user.id);
  }

  @Get()
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.MAINTENANCE)
  @ApiQuery({ name: 'status', required: false, enum: IncidentStatus })
  @ApiQuery({ name: 'type', required: false, enum: IncidentType })
  @ApiQuery({ name: 'severity', required: false, enum: IncidentSeverity })
  @ApiQuery({ name: 'truckId', required: false })
  @ApiQuery({ name: 'unassigned', required: false, type: Boolean })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Fecha desde (inclusive, formato YYYY-MM-DD) sobre createdAt.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Fecha hasta (inclusive, formato YYYY-MM-DD) sobre createdAt.',
  })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('status') status?: IncidentStatus,
    @Query('type') type?: IncidentType,
    @Query('severity') severity?: IncidentSeverity,
    @Query('truckId') truckId?: string,
    @Query('unassigned') unassigned?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.incidentsService.paginate(
      { page, limit },
      {
        status,
        type,
        severity,
        truckId,
        unassigned: unassigned === 'true',
        from,
        to,
      },
    );
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.MAINTENANCE)
  findOne(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }

  @Patch(':id/assign')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignIncidentDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.incidentsService.assign(id, dto, user);
  }

  @Patch(':id/status')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MAINTENANCE)
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeIncidentStatusDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.incidentsService.changeStatus(id, dto, user);
  }

  @Post(':id/comment')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MAINTENANCE)
  comment(
    @Param('id') id: string,
    @Body() dto: CommentIncidentDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.incidentsService.comment(id, dto, user);
  }
}
