import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  EMPRESA_A,
  cambiarPlan,
  cerrarEntorno,
  levantarEntorno,
  loginA,
  type EntornoE2E,
} from './helpers/entorno-e2e';

/**
 * Gating por plan y límites cuantitativos (fases 3 y 4).
 *
 * Verifica lo que hasta ahora sólo se había probado a mano: que el backend
 * rechace de verdad lo que el plan no incluye. El gating del front es
 * experiencia de usuario; esto es lo que impide que alguien que manipula el
 * navegador acceda a un módulo que no pagó.
 */
describe('Gating por plan y límites', () => {
  let entorno: EntornoE2E;
  let app: INestApplication;
  let token: string;

  jest.setTimeout(180_000);

  beforeAll(async () => {
    entorno = await levantarEntorno();
    app = entorno.app;
  });

  afterAll(async () => {
    await cerrarEntorno(entorno);
  });

  /** Renueva el token después de cambiar de plan. */
  const enPlan = async (code: string) => {
    await cambiarPlan(entorno, EMPRESA_A, code);
    token = await loginA(app);
  };

  const get = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);

  const post = (url: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  describe('Plan Control: sólo los módulos base', () => {
    beforeAll(() => enPlan('control'));

    it.each([
      ['rendiciones', '/api/v1/settlements'],
      ['indicadores', '/api/v1/indicators/summary'],
      ['combustible', '/api/v1/fuel'],
      ['mantenimiento', '/api/v1/maintenance/plans'],
      ['planillas OEA', '/api/v1/oea'],
      ['legajos', '/api/v1/hr/employees'],
    ])('rechaza %s con 403', async (_nombre, url) => {
      const res = await get(url);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FEATURE_NOT_IN_PLAN');
      expect(res.body.currentPlan).toBe('control');
    });

    it.each([
      ['flota', '/api/v1/trucks'],
      ['viajes', '/api/v1/trips'],
    ])('permite %s, que es módulo base', async (_nombre, url) => {
      const res = await get(url);
      expect(res.status).toBe(200);
    });

    it('el 403 nombra la feature, para que el front ofrezca el upgrade correcto', async () => {
      const res = await get('/api/v1/settlements');
      expect(res.body.feature).toBe('settlements');
    });

    it('no deja crear un rol que el plan no incluye', async () => {
      const res = await post('/api/v1/auth/create-user', {
        email: `aud-${Date.now()}@e2e.test`,
        name: 'Auditor',
        password: 'Passw0rd!E2E',
        role: 'auditor',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ROLE_NOT_IN_PLAN');
    });

    it('sí deja crear un rol incluido', async () => {
      const res = await post('/api/v1/auth/create-user', {
        email: `drv-${Date.now()}@e2e.test`,
        name: 'Chofer',
        password: 'Passw0rd!E2E',
        role: 'driver',
      });
      expect(res.status).toBeLessThan(300);
    });

    it('frena la cuarta regla de alerta activa (tope 3)', async () => {
      for (const key of ['lim1', 'lim2', 'lim3']) {
        const ok = await post('/api/v1/alerts/thresholds', {
          key,
          value: '1',
          enabled: true,
        });
        expect(ok.status).toBeLessThan(300);
      }

      const cuarta = await post('/api/v1/alerts/thresholds', {
        key: 'lim4',
        value: '1',
        enabled: true,
      });
      expect(cuarta.status).toBe(400);
      expect(cuarta.body.error).toBe('PLAN_LIMIT_REACHED');
      expect(cuarta.body.max).toBe(3);
    });

    it('editar una regla ya activa no consume cupo nuevo', async () => {
      const res = await post('/api/v1/alerts/thresholds', {
        key: 'lim1',
        value: '99',
        enabled: true,
      });
      expect(res.status).toBeLessThan(300);
    });

    it('crear una regla apagada tampoco consume cupo', async () => {
      const res = await post('/api/v1/alerts/thresholds', {
        key: 'apagada',
        value: '1',
        enabled: false,
      });
      expect(res.status).toBeLessThan(300);
    });
  });

  describe('Plan Gestión: se habilita lo que Control no tenía', () => {
    beforeAll(() => enPlan('gestion'));

    it.each([
      ['rendiciones', '/api/v1/settlements'],
      ['indicadores', '/api/v1/indicators/summary'],
      ['combustible', '/api/v1/fuel'],
      ['mantenimiento', '/api/v1/maintenance/plans'],
      ['planillas OEA', '/api/v1/oea'],
      ['legajos', '/api/v1/hr/employees'],
    ])('permite %s', async (_nombre, url) => {
      const res = await get(url);
      expect(res.status).toBe(200);
    });

    it('el rol auditor pasa a estar disponible', async () => {
      const res = await post('/api/v1/auth/create-user', {
        email: `aud2-${Date.now()}@e2e.test`,
        name: 'Auditor',
        password: 'Passw0rd!E2E',
        role: 'auditor',
      });
      expect(res.status).toBeLessThan(300);
    });

    it('las reglas de alerta pasan a ser ilimitadas', async () => {
      const res = await post('/api/v1/alerts/thresholds', {
        key: `libre-${Date.now()}`,
        value: '1',
        enabled: true,
      });
      expect(res.status).toBeLessThan(300);
    });
  });

  describe('La sesión refleja el plan vigente', () => {
    it('cambia sin necesidad de volver a loguearse', async () => {
      await enPlan('control');
      const control = await get('/api/v1/auth/session');
      expect(control.body.plan.code).toBe('control');
      expect(control.body.features).not.toContain('settlements');
      expect(control.body.limits.retentionMonths).toBe(6);
      expect(control.body.limits.storageGb).toBe(2);

      // Se cambia el plan SIN emitir un token nuevo.
      await cambiarPlan(entorno, EMPRESA_A, 'gestion');

      const gestion = await get('/api/v1/auth/session');
      expect(gestion.body.plan.code).toBe('gestion');
      expect(gestion.body.features).toContain('settlements');
      expect(gestion.body.limits.retentionMonths).toBe(60);
    });
  });

  describe('El gating no depende del rol de administrador', () => {
    it('un admin de una empresa en Control sigue sin rendiciones', async () => {
      await enPlan('control');
      // El token es de un usuario con rol `admin`: el plan es un límite de la
      // empresa, no un permiso del usuario.
      const res = await get('/api/v1/settlements');
      expect(res.status).toBe(403);
    });
  });
});
