import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Dashboard')
@Controller('dashboard')
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Auth(Role.ADMIN)
  getDashboard(@ActiveUser() user: ActiveUserInterface) {
    return this.dashboardService.getDashboard(user);
  }
}
