import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OverviewQueryDto } from './dto/overview-query.dto';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Dashboard')
@Controller('dashboard')
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Resumen del dashboard con tendencias del período seleccionado.',
    description:
      'Devuelve la foto del estado actual (trucksByStatus, incidents, alerts, ' +
      'todayExpenses, delayedTrips, driversWithNews, upcomingMaintenance) y un ' +
      'bloque `trends` con value/previousValue/series por métrica según `range`.',
  })
  getOverview(
    @Query() query: OverviewQueryDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    // La empresa va explícita: el panel recorta sus métricas según el plan.
    return this.dashboardService.getOverview(query.range ?? '7d', user.companyId);
  }
}
