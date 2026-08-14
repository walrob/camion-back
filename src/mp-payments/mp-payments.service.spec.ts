import { MpPaymentsService } from './mp-payments.service';

/**
 * La URL de avisos de Mercado Pago.
 *
 * Merece un test propio porque es el único punto de la integración que falla
 * **en silencio**: si `notification_url` apunta a un 404, el cobro sale bien,
 * el cliente paga, MP no puede avisarnos y la factura queda impaga camino al
 * bloqueo. No hay excepción, no hay log, no hay nada que mirar.
 *
 * `BACK_URL` convive en dos formatos entre estos proyectos —con el prefijo de
 * la API incluido, como en Aturna, y sin él—, así que se aceptan los dos.
 */
describe('MpPaymentsService: URL de avisos', () => {
  const servicio = Object.create(
    MpPaymentsService.prototype,
  ) as MpPaymentsService;

  const urlCon = (backUrl: string): string => {
    process.env.BACK_URL = backUrl;
    return (servicio as unknown as { urlDeAvisos: string }).urlDeAvisos;
  };

  const ESPERADA = 'https://api.fleetlog.com.ar/api/v1/webhooks/mercadopago';

  it('acepta BACK_URL con el prefijo de la API incluido (formato Aturna)', () => {
    expect(urlCon('https://api.fleetlog.com.ar/api/v1/')).toBe(ESPERADA);
  });

  it('acepta BACK_URL sin el prefijo', () => {
    expect(urlCon('https://api.fleetlog.com.ar')).toBe(ESPERADA);
  });

  it('no duplica el prefijo ni deja barras de más', () => {
    expect(urlCon('https://api.fleetlog.com.ar/api/v1')).toBe(ESPERADA);
    expect(urlCon('https://api.fleetlog.com.ar///')).toBe(ESPERADA);
  });
});
