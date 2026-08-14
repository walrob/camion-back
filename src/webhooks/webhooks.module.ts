import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MpWebhookEvent } from 'src/billing/entities/mp-webhook-event.entity';
import { MpPaymentsModule } from 'src/mp-payments/mp-payments.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Entrada de avisos externos.
 *
 * `MpWebhookEvent` va por `TypeOrmModule` y no por el scopeado: cuando el aviso
 * llega todavía no se sabe de qué empresa es —eso sale de consultar el pago en
 * MP—, así que no hay empresa por la que filtrar.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MpWebhookEvent]), MpPaymentsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  // El panel de plataforma reprocesa un aviso fallido por el mismo camino que
  // usa el reenvío de MP, candado de idempotencia incluido.
  exports: [WebhooksService],
})
export class WebhooksModule {}
