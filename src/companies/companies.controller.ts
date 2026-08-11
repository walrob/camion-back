import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { CompaniesService } from './companies.service';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { Company } from './entities/company.entity';

@ApiTags('Empresas')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * Alta pública desde la landing. **Sin autenticación**, por definición.
   *
   * Limitado a 5 intentos cada 10 minutos por IP (riesgo R6.1): un endpoint
   * público que crea tenants es un blanco obvio para el alta masiva de cuentas
   * basura, y cada tenant basura ocupa lugar y ensucia las métricas.
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Crea una empresa con su usuario administrador y arranca el trial de ' +
      '21 días del plan Operación.',
  })
  register(@Body() dto: RegisterCompanyDto) {
    return this.companiesService.register(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @Auth()
  @ApiOperation({ summary: 'Datos de la empresa del usuario autenticado.' })
  miEmpresa(@ActiveUser() user: ActiveUserInterface) {
    return this.companiesService.findOne(user.companyId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Actualiza los datos de la propia empresa.' })
  actualizar(
    @Body() datos: Partial<Company>,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.companiesService.actualizar(user.companyId, datos);
  }

  @Patch('me/onboarding')
  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Avanza el onboarding guiado. `step: 0` lo da por terminado.',
  })
  onboarding(
    @Body() body: { step: number },
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.companiesService.actualizarOnboarding(
      user.companyId,
      body.step,
    );
  }
}
