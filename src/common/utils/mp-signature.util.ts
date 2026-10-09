import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Valida el header `x-signature` de un aviso de Mercado Pago.
 *
 * Formato del header: `ts=<timestamp>,v1=<hmac>`. Lo firmado es
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, y si falta `data.id` o
 * `x-request-id` ese segmento se omite. Es la misma validación que Aturna.
 */
export function esFirmaMpValida(params: {
  secret: string;
  signature?: string;
  requestId?: string;
  dataId?: string;
}): boolean {
  const { secret, signature, requestId, dataId } = params;
  if (!secret || !signature) return false;

  const partes: Record<string, string> = {};
  for (const parte of signature.split(',')) {
    const [clave, valor] = parte.split('=').map((s) => s?.trim());
    if (clave && valor) partes[clave] = valor;
  }
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;

  // MP firma los ids alfanuméricos en minúscula.
  const id = dataId ? String(dataId).toLowerCase() : '';
  let manifiesto = '';
  if (id) manifiesto += `id:${id};`;
  if (requestId) manifiesto += `request-id:${requestId};`;
  manifiesto += `ts:${ts};`;

  const esperado = createHmac('sha256', secret).update(manifiesto).digest('hex');
  if (esperado.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
}
