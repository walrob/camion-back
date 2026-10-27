import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Onboarding')
@Controller('onboarding')
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Primeros pasos de la empresa, calculados sobre los datos reales.',
  })
  progreso(@ActiveUser() user: ActiveUserInterface) {
    return this.onboardingService.progreso(user.companyId);
  }

  @Post('hide')
  @HttpCode(204)
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Oculta la guía de primeros pasos del panel.' })
  ocultar(@ActiveUser() user: ActiveUserInterface) {
    return this.onboardingService.ocultar(user.companyId);
  }
}
