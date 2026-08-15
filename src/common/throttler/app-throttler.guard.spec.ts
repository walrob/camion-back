import { ExecutionContext } from '@nestjs/common';
import { AppThrottlerGuard } from './app-throttler.guard';

/**
 * Qué se cuenta en el rate limit.
 *
 * Se prueba `getTracker` directamente y no a través de un request: el criterio
 * —sesión cuando la hay, IP cuando no— es la decisión de diseño del guard, y
 * verificarla a fuerza de disparar 121 llamadas sería lento y frágil. Que el
 * guard esté efectivamente enganchado lo prueba `test/rate-limit.e2e-spec.ts`.
 */
describe('AppThrottlerGuard', () => {
  // `getTracker` y `shouldSkip` son protected: se accede por índice en vez de
  // exponerlos, que sería cambiar el diseño para poder testearlo.
  const guard = new AppThrottlerGuard(
    [] as never,
    {} as never,
    {} as never,
  ) as unknown as {
    getTracker(req: Record<string, unknown>): Promise<string>;
    shouldSkip(ctx: ExecutionContext): Promise<boolean>;
  };

  const requestCon = (headers: Record<string, string>, ip = '10.0.0.1') => ({
    headers,
    ip,
  });

  describe('con sesión', () => {
    it('cuenta por token y no por IP', async () => {
      const mismaSesion = { authorization: 'Bearer token-de-ana' };

      const desdeLaOficina = await guard.getTracker(
        requestCon(mismaSesion, '200.1.1.1'),
      );
      const desdeLaCasa = await guard.getTracker(
        requestCon(mismaSesion, '200.9.9.9'),
      );

      expect(desdeLaOficina).toBe(desdeLaCasa);
      expect(desdeLaOficina).toMatch(/^sesion:/);
    });

    it('separa a dos usuarios que salen por la misma IP', async () => {
      // El caso que motiva el diseño: una oficina entera detrás de una sola IP
      // pública no puede compartir el balde.
      const ana = await guard.getTracker(
        requestCon({ authorization: 'Bearer token-de-ana' }, '200.1.1.1'),
      );
      const beto = await guard.getTracker(
        requestCon({ authorization: 'Bearer token-de-beto' }, '200.1.1.1'),
      );

      expect(ana).not.toBe(beto);
    });

    it('no deja el token en claro en la clave', async () => {
      const tracker = await guard.getTracker(
        requestCon({ authorization: 'Bearer token-secretisimo' }),
      );

      expect(tracker).not.toContain('token-secretisimo');
    });
  });

  describe('sin sesión', () => {
    it('cuenta por IP', async () => {
      const tracker = await guard.getTracker(requestCon({}, '190.2.2.2'));
      expect(tracker).toBe('ip:190.2.2.2');
    });

    it('separa dos IP distintas', async () => {
      const una = await guard.getTracker(requestCon({}, '190.2.2.2'));
      const otra = await guard.getTracker(requestCon({}, '190.3.3.3'));
      expect(una).not.toBe(otra);
    });

    it('ignora un Authorization que no sea Bearer', async () => {
      const tracker = await guard.getTracker(
        requestCon({ authorization: 'Basic dXN1YXJpbzpjbGF2ZQ==' }, '190.2.2.2'),
      );
      expect(tracker).toBe('ip:190.2.2.2');
    });

    it('no explota si no hay IP ni headers', async () => {
      await expect(guard.getTracker({})).resolves.toBe('ip:desconocida');
    });
  });

  describe('interruptor de los tests', () => {
    const original = process.env.THROTTLE_ENABLED;
    afterEach(() => {
      process.env.THROTTLE_ENABLED = original;
    });

    it('se saltea con THROTTLE_ENABLED=false', async () => {
      process.env.THROTTLE_ENABLED = 'false';
      await expect(guard.shouldSkip({} as ExecutionContext)).resolves.toBe(true);
    });

    it('está activo por defecto', async () => {
      delete process.env.THROTTLE_ENABLED;
      await expect(guard.shouldSkip({} as ExecutionContext)).resolves.toBe(
        false,
      );
    });
  });
});
