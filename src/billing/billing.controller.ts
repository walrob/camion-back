import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { BillingService } from './billing.service';

@ApiTags('Facturación')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('quote')
  @Auth(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Cuánto le corresponde pagar hoy a la empresa, sin emitir nada.',
  })
  cotizar(@ActiveUser() user: ActiveUserInterface) {
    return this.billing.cotizar(user.companyId);
  }

  @Get('subscriptions')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({ summary: 'Períodos facturados de la empresa.' })
  periodos(@ActiveUser() user: ActiveUserInterface) {
    return this.billing.listarPeriodos(user.companyId);
  }

  @Post('plan')
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary:
      'Cambia el plan. El upgrade se aplica al instante con prorrateo; ' +
      'el downgrade queda agendado para la próxima renovación.',
  })
  cambiarPlan(
    @Body() body: { planCode: string },
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.billing.cambiarPlan(user.companyId, body.planCode, user.id);
  }

  @Get('snapshot')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({ summary: 'Unidades facturables de la empresa en este momento.' })
  unidades(@ActiveUser() user: ActiveUserInterface) {
    return this.billing.contarUnidadesHoy(user.companyId);
  }
}
