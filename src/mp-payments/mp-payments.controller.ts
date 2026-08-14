import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { MpPaymentsService } from './mp-payments.service';

/**
 * Pago de la propia suscripción, desde la cuenta del cliente.
 *
 * **La ruta cuelga de `billing/` a propósito.** `AccountStatusGuard` deja
 * pasar `/api/v1/billing` con la cuenta bloqueada, y este es justamente el
 * camino de salida del bloqueo: dejar a alguien suspendido sin manera de pagar
 * es la forma más segura de perderlo en vez de cobrarle.
 */
@ApiTags('Facturación')
@ApiBearerAuth()
@Controller('billing/mp')
export class MpPaymentsController {
  constructor(private readonly mp: MpPaymentsService) {}

  @Get('status')
  @Auth(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Estado del cobro automático de la empresa y deuda pendiente.',
  })
  estado(@ActiveUser() user: ActiveUserInterface) {
    return this.mp.estado(user.companyId);
  }

  @Post('checkout/:subscriptionId')
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Link de Mercado Pago para saldar un período.' })
  checkout(
    @Param('subscriptionId') subscriptionId: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.mp.linkDePago(user.companyId, subscriptionId);
  }

  @Post('subscription')
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary:
      'Activa el débito automático mensual. Exige no tener períodos impagos.',
  })
  activarDebito(
    @Body() body: { payerEmail?: string },
    @ActiveUser() user: ActiveUserInterface,
  ) {
    // Si no se indica, el pagador es quien lo activa: es quien va a recibir los
    // comprobantes de MP. El servicio lo resuelve porque el token no lleva el
    // email.
    return this.mp.crearDebitoAutomatico(
      user.companyId,
      user.id,
      body?.payerEmail,
    );
  }

  @Delete('subscription')
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Cancela el débito automático.' })
  cancelarDebito(@ActiveUser() user: ActiveUserInterface) {
    return this.mp.cancelarDebitoAutomatico(user.companyId);
  }
}
