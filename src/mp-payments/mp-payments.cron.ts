import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MpPaymentsService } from './mp-payments.service';

/**
 * Puesta al día de los importes del débito automático.
 *
 * Corre **después** de la emisión de las 4 (`BillingCron.emisionDiaria`): así
 * el monto que se le informa a MP es el del período recién emitido, no el del
 * anterior. Media hora de margen alcanza de sobra para unas cuantas empresas y
 * evita depender del orden en que Nest dispara dos crons de la misma hora.
 *
 * Va en su propio archivo y no dentro de `BillingCron` para no invertir la
 * dependencia: facturación no sabe que Mercado Pago existe —factura igual si el
 * cliente paga por transferencia—, y es Mercado Pago el que se entera de lo que
 * facturación decidió.
 */
@Injectable()
export class MpPaymentsCron {
  private readonly logger = new Logger(MpPaymentsCron.name);

  constructor(private readonly mpPayments: MpPaymentsService) {}

  @Cron('30 4 * * *')
  async sincronizarImportes(): Promise<void> {
    if (!this.mpPayments.disponible) return;

    const actualizadas = await this.mpPayments.sincronizarImportes();
    if (actualizadas) {
      this.logger.log(
        `Débito automático: importe actualizado en ${actualizadas} empresa(s).`,
      );
    }
  }
}
