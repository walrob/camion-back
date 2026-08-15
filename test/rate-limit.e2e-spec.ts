import * as request from 'supertest';
import {
  cerrarEntorno,
  EntornoE2E,
  levantarEntorno,
  loginA,
  loginB,
  PASSWORD,
  EMAIL_A,
} from './helpers/entorno-e2e';

/**
 * El rate limit está efectivamente enganchado.
 *
 * Esta suite existe por un bug concreto: `ThrottlerModule.forRoot()` estaba
 * configurado desde la fase 6 pero **nunca se registró el `APP_GUARD`**, así que
 * los seis `@Throttle(...)` del proyecto no corrían. La configuración se veía
 * bien en el código y no hacía nada, que es la peor forma de tener una
 * protección: la que figura en el plan como cubierta.
 *
 * Por eso lo que se verifica acá no es el algoritmo del throttler —eso lo prueba
 * la librería— sino que **un endpoint decorado devuelva 429**, que es justo lo
 * que no pasaba.
 *
 * El resto de las suites corre con el límite apagado (`THROTTLE_ENABLED=false`
 * en `entorno-e2e`); ésta lo enciende a propósito.
 */
describe('Rate limit (e2e)', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await levantarEntorno();
  }, 180_000);

  afterAll(async () => {
    process.env.THROTTLE_ENABLED = 'false';
    await cerrarEntorno(entorno);
  });

  beforeEach(() => {
    process.env.THROTTLE_ENABLED = 'true';
  });

  afterEach(() => {
    // Se apaga entre casos para que un test no se coma el presupuesto del que
    // sigue.
    process.env.THROTTLE_ENABLED = 'false';
  });

  /**
   * R6.1: el alta pública de empresas admite 5 intentos cada 10 minutos.
   *
   * Es el `@Throttle` que el plan da como mitigación del alta masiva de cuentas
   * basura. Antes de este arreglo se podían hacer las llamadas que se quisieran.
   */
  it('corta el alta pública de empresas al sexto intento', async () => {
    const servidor = entorno.app.getHttpServer();
    const codigos: number[] = [];

    for (let i = 0; i < 7; i++) {
      const res = await request(servidor)
        .post('/api/v1/companies/register')
        // Cuerpo inválido a propósito: lo que se mide es el límite, no el alta.
        // Un 400 consume presupuesto igual, que es lo que hace útil al límite.
        .send({ email: `basura-${i}@e2e.test` });
      codigos.push(res.status);
    }

    expect(codigos.slice(0, 5)).not.toContain(429);
    expect(codigos[5]).toBe(429);
    expect(codigos[6]).toBe(429);
  });

  /**
   * El reenvío del mail de confirmación admite 5 cada 10 minutos.
   *
   * Se prueba un segundo endpoint decorado, y con otro límite, para que el test
   * no pueda pasar por casualidad: si el guard estuviera enganchado pero
   * ignorando el `@Throttle` del método, acá cortaría en el techo global de 120
   * en vez de en 5.
   */
  it('corta el reenvío de confirmación al sexto intento', async () => {
    const servidor = entorno.app.getHttpServer();
    const codigos: number[] = [];

    for (let i = 0; i < 7; i++) {
      const res = await request(servidor)
        .post('/api/v1/auth/resend-verification')
        .send({ email: EMAIL_A });
      codigos.push(res.status);
    }

    expect(codigos.slice(0, 5)).not.toContain(429);
    expect(codigos[5]).toBe(429);
  });

  /**
   * Dos sesiones distintas no comparten el contador aunque salgan por la misma
   * IP.
   *
   * Es la mitad del arreglo que no se ve: si se contara por IP, una oficina
   * entera detrás de una sola IP pública se cortaría sola. Se verifica con el
   * endpoint de sesión, que no tiene `@Throttle` propio y usa el techo global.
   */
  it('cuenta por sesión y no por IP en el tráfico autenticado', async () => {
    process.env.THROTTLE_ENABLED = 'false';
    // Dos usuarios distintos, no dos logins del mismo: el JWT se arma con el
    // payload y un `iat` en segundos, así que dos logins seguidos de la misma
    // persona devuelven el MISMO token y no probarían nada.
    const tokenUno = await loginA(entorno.app);
    const tokenDos = await loginB(entorno.app);
    process.env.THROTTLE_ENABLED = 'true';

    expect(tokenUno).not.toBe(tokenDos);

    const servidor = entorno.app.getHttpServer();
    const pedir = (token: string) =>
      request(servidor)
        .get('/api/v1/auth/session')
        .set('Authorization', `Bearer ${token}`);

    // Se agota el presupuesto de la primera sesión (120 por minuto).
    let ultimoDeUno = 0;
    for (let i = 0; i < 125; i++) {
      ultimoDeUno = (await pedir(tokenUno)).status;
      if (ultimoDeUno === 429) break;
    }
    expect(ultimoDeUno).toBe(429);

    // La segunda, desde la misma IP, sigue entrando.
    const laOtraSesion = await pedir(tokenDos);
    expect(laOtraSesion.status).not.toBe(429);
  }, 120_000);

  /** Con el interruptor apagado no limita nada: es lo que usan las otras suites. */
  it('no limita cuando THROTTLE_ENABLED es false', async () => {
    process.env.THROTTLE_ENABLED = 'false';
    const servidor = entorno.app.getHttpServer();

    for (let i = 0; i < 10; i++) {
      const res = await request(servidor)
        .post('/api/v1/companies/register')
        .send({ email: `sin-limite-${i}@e2e.test` });
      expect(res.status).not.toBe(429);
    }
  });

  it('el login sigue funcionando con credenciales válidas', async () => {
    process.env.THROTTLE_ENABLED = 'false';
    const res = await request(entorno.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL_A, password: PASSWORD });

    expect(res.status).toBeLessThan(400);
    expect(res.body.token).toBeDefined();
  });
});
