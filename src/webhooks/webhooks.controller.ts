import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { esFirmaMpValida } from 'src/common/utils/mp-signature.util';
import { WebhooksService } from './webhooks.service';

/**
 * Cuerpo del aviso de MP. Sólo se usa para saber **qué** consultar: el estado y
 * el importe se leen después contra la API con nuestro token, nunca de acá.
 */
interface AvisoMp {
  type?: string;
  action?: string;
  data?: { id?: string | number };
}

/**
 * Avisos de Mercado Pago.
 *
 * **Es público**, así que tiene dos barreras:
 *
 *  1. **La firma `x-signature`** (HMAC con `MP_WEBHOOK_SECRET`): descarta todo
 *     lo que no venga de MP antes de tocar la base o la API. Sin el secreto
 *     configurado se rechaza todo: un webhook abierto es peor que uno que no
 *     anda, porque el segundo se nota.
 *  2. **El aviso no se cree**: sólo dice "mirá el recurso X", y el estado real
 *     se consulta contra la API de MP.
 *
 * MP también manda el formato viejo IPN (`?topic=...&id=...`), que **no viene
 * firmado**. Se responde 200 sin procesarlo: es un duplicado del aviso nuevo,
 * que sí llega firmado, y rechazarlo sólo haría que MP lo reintente un día.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooks: WebhooksService) {}

  @Post('mercadopago')
  // 200 y no 201: MP sólo mira que sea 2xx, pero un 201 sugiere que se creó un
  // recurso, y un aviso repetido no crea nada.
  @HttpCode(200)
  // El endpoint es público y MP puede ráfagar reintentos. El límite es holgado
  // para no perder avisos legítimos y acotado para que no sea una puerta libre.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async mercadopago(
    @Body() body: AvisoMp,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
    @Query('type') queryType?: string,
    @Query('topic') queryTopic?: string,
    @Query('data.id') queryDataId?: string,
  ) {
    if (queryTopic && !body?.type && !queryType) {
      return { received: true, ignorado: 'ipn' };
    }

    // MP firma el `data.id` de la query; el del cuerpo es el mismo valor.
    const id = queryDataId ?? body?.data?.id;
    const type = body?.type ?? queryType;

    const secret = process.env.MP_WEBHOOK_SECRET ?? '';
    if (
      !esFirmaMpValida({
        secret,
        signature,
        requestId,
        dataId: id !== undefined ? String(id) : undefined,
      })
    ) {
      if (!secret) this.logger.error('MP_WEBHOOK_SECRET no configurado.');
      throw new UnauthorizedException('Firma inválida.');
    }

    // Sin tipo o sin recurso no hay nada que consultar. Se responde 200 igual:
    // devolver un error haría que MP lo reintente eternamente sin que cambie
    // nada.
    if (!type || !id) return { received: true };

    const r = await this.webhooks.procesar(String(type), String(id));
    return { received: true, ...r };
  }
}
