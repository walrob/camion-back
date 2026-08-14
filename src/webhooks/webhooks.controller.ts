import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
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
 * **Es público**: MP no manda credenciales. Lo que lo hace seguro no es un
 * token sino que el aviso no se cree: sólo dice "mirá el recurso X", y el
 * estado real se consulta contra la API de MP. Un tercero que mandara avisos
 * falsos lo único que lograría es que consultemos pagos ajenos, que no existen
 * o que no son de ninguna empresa nuestra.
 *
 * MP también manda el identificador por query string (`?type=...&data.id=...`)
 * según el tipo de notificación, así que se aceptan las dos formas.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
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
    @Query('type') queryType?: string,
    @Query('topic') queryTopic?: string,
    @Query('id') queryId?: string,
    @Query('data.id') queryDataId?: string,
  ) {
    const type = body?.type ?? queryType ?? queryTopic;
    const id = body?.data?.id ?? queryDataId ?? queryId;

    // Sin tipo o sin recurso no hay nada que consultar. Se responde 200 igual:
    // devolver un error haría que MP lo reintente eternamente sin que cambie
    // nada.
    if (!type || !id) return { received: true };

    const r = await this.webhooks.procesar(String(type), String(id));
    return { received: true, ...r };
  }
}
