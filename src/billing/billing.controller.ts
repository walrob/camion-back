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
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StorageService } from 'src/common/storage/storage.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { BillingService } from './billing.service';

@ApiTags('Facturación')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly storage: StorageService,
  ) {}

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

  /**
   * Comprobante de un período, para el cliente.
   *
   * Se sirve el archivo y no una URL firmada de S3, igual que el PDF de la
   * rendición: el bucket no es público y una URL firmada que se filtra sigue
   * siendo válida hasta que expira. Acá cada descarga vuelve a pasar por el
   * chequeo de que el período sea de esta empresa.
   */
  @Get('subscriptions/:id/invoice')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({ summary: 'Descarga el comprobante del período.' })
  async comprobante(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { key, nombre } = await this.billing.keyDelComprobante(
      user.companyId,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    });
    return this.storage.getFileStream(key);
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

  @Get('addons')
  @Auth(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Catálogo de add-ons, con cuáles ya están contratados y cuáles ' +
      'están disponibles para el plan actual.',
  })
  addons(@ActiveUser() user: ActiveUserInterface) {
    return this.billing.addonsDisponibles(user.companyId);
  }

  @Post('addons')
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Contrata un add-on. Se aplica al instante y se prorratea.',
  })
  contratarAddon(
    @Body() body: { code: string; quantity?: number },
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.billing.contratarAddon(
      user.companyId,
      body.code,
      body.quantity ?? 1,
      user.id,
    );
  }

  @Delete('addons/:code')
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary:
      'Da de baja un add-on a partir de la próxima renovación: el período en ' +
      'curso ya está cobrado y se sigue usando hasta el cierre.',
  })
  darDeBajaAddon(
    @Param('code') code: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.billing.darDeBajaAddon(user.companyId, code, user.id);
  }

  @Get('snapshot')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({ summary: 'Unidades facturables de la empresa en este momento.' })
  unidades(@ActiveUser() user: ActiveUserInterface) {
    return this.billing.contarUnidadesHoy(user.companyId);
  }
}
