import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MpWebhookEvent } from 'src/billing/entities/mp-webhook-event.entity';
import { MpPaymentsService } from 'src/mp-payments/mp-payments.service';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/** Tipos de aviso que sabemos procesar. El resto se registra y se ignora. */
const TIPOS_DE_PAGO = ['payment'];
const TIPOS_DE_SUSCRIPCION = ['preapproval', 'subscription_preapproval'];

export interface ResultadoWebhook {
  procesado: boolean;
  duplicado: boolean;
  detalle?: unknown;
}

/**
 * Recepción de avisos de Mercado Pago.
 *
 * Todo el servicio existe por un solo motivo: **MP reenvía**. Reintenta hasta
 * recibir un 200 y puede mandar dos copias del mismo aviso a la vez. Sin
 * idempotencia, un pago de $ 283.800 se acreditaría dos veces y el cliente
 * vería su cuenta pagada hasta fin de año (riesgo R9.2).
 *
 * El candado es una fila en `mp_webhook_events` con índice único
 * `(type, resourceId)`, insertada **antes** de procesar. Quien logra insertarla
 * procesa; quien choca contra el índice mira si el aviso ya terminó de
 * procesarse:
 *
 *  - **Terminado** → se descarta, que es el caso normal del reenvío.
 *  - **A medias** (`processedAt` en NULL) → se reintenta. Es lo que hace que un
 *    fallo transitorio —la API de MP caída dos minutos— se recupere solo con el
 *    reintento de MP en vez de quedar trabado para siempre por su propio
 *    candado. La doble acreditación sigue siendo imposible: el índice único de
 *    `payments.mpPaymentId` es el que decide.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(MpWebhookEvent)
    private readonly eventos: Repository<MpWebhookEvent>,
    private readonly mpPayments: MpPaymentsService,
  ) {}

  async procesar(type: string, resourceId: string): Promise<ResultadoWebhook> {
    const evento = await this.tomarElCandado(type, resourceId);
    if (!evento) {
      this.logger.log(`Aviso repetido de MP, descartado: ${type} ${resourceId}`);
      return { procesado: false, duplicado: true };
    }

    try {
      const detalle = await this.despachar(type, resourceId);

      await runAsSystem(() =>
        this.eventos.update(evento.id, {
          processedAt: new Date(),
          error: null,
          companyId:
            (detalle as { companyId?: string | null })?.companyId ?? null,
        }),
      );

      return { procesado: true, duplicado: false, detalle };
    } catch (e) {
      // Queda con `processedAt` en NULL y el motivo escrito: el reintento de MP
      // lo vuelve a tomar, y si nunca llega, se ve en la tabla qué pasó.
      await runAsSystem(() =>
        this.eventos.update(evento.id, { error: String(e).slice(0, 500) }),
      );
      this.logger.error(`Aviso de MP fallido (${type} ${resourceId}): ${String(e)}`);
      throw e;
    }
  }

  /**
   * Inserta la marca del aviso. `null` = ya está procesado por otro.
   *
   * El `catch` sobre el índice único no es una optimización: es la única forma
   * de que dos copias simultáneas del mismo aviso no pasen las dos. Un
   * `SELECT` previo seguido de un `INSERT` deja una ventana entre ambos, y ahí
   * es exactamente donde caen los reenvíos en paralelo de MP.
   */
  private async tomarElCandado(
    type: string,
    resourceId: string,
  ): Promise<MpWebhookEvent | null> {
    try {
      return await runAsSystem(() =>
        this.eventos.save(this.eventos.create({ type, resourceId })),
      );
    } catch {
      const existente = await runAsSystem(() =>
        this.eventos.findOne({ where: { type, resourceId } }),
      );

      // Quedó a medias: se reintenta sobre la misma fila.
      if (existente && !existente.processedAt) return existente;
      return null;
    }
  }

  private async despachar(type: string, resourceId: string): Promise<unknown> {
    if (TIPOS_DE_PAGO.includes(type)) {
      return this.mpPayments.confirmarPago(resourceId);
    }

    if (TIPOS_DE_SUSCRIPCION.includes(type)) {
      return this.mpPayments.confirmarPreapproval(resourceId);
    }

    // MP manda avisos de cosas que no usamos (`plan`, `invoice`, tests desde el
    // panel). Se registran como procesados para que deje de reintentarlos.
    this.logger.log(`Aviso de MP ignorado por tipo: ${type} ${resourceId}`);
    return { ignorado: true, type };
  }
}
