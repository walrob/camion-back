import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { SetThresholdDto } from './dto/set-threshold.dto';
import { AlertLevel, AlertStatus } from 'src/common/enums/alert.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.HR)
  @ApiQuery({ name: 'level', required: false, enum: AlertLevel })
  @ApiQuery({ name: 'status', required: false, enum: AlertStatus })
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
  list(
    @Query('level') level?: AlertLevel,
    @Query('status') status?: AlertStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.alertsService.list({ level, status, from, to });
  }

  @Get('count')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.HR)
  count() {
    return this.alertsService.countActive();
  }

  @Get('thresholds')
  @Auth(Role.ADMIN, Role.MANAGER)
  thresholds() {
    return this.alertsService.getAllThresholds();
  }

  @Post('thresholds')
  @Auth(Role.ADMIN, Role.MANAGER)
  setThreshold(@Body() dto: SetThresholdDto) {
    return this.alertsService.setThreshold(dto.key, dto.value, dto.enabled);
  }

  @Patch(':id/seen')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.HR)
  seen(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.alertsService.setStatus(id, AlertStatus.SEEN, user);
  }

  @Patch(':id/acknowledge')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.HR)
  acknowledge(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.alertsService.setStatus(id, AlertStatus.ACKNOWLEDGED, user);
  }

  @Patch(':id/resolve')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.HR)
  resolve(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.alertsService.setStatus(id, AlertStatus.RESOLVED, user);
  }
}
