import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcryptjs from 'bcryptjs';
import {
  EMPRESA_A,
  EMPRESA_B,
  PASSWORD,
  cerrarEntorno,
  levantarEntorno,
  loginA,
  type EntornoE2E,
} from './helpers/entorno-e2e';

/**
 * Panel de plataforma (fase 8).
 *
 * El superadmin es, por diseño, el agujero del aislamiento que se construyó en
 * la fase 2. Estos tests verifican los dos riesgos que lo hacen aceptable:
 *
 *  - **R8.1**: nadie más puede entrar, y todo lo que hace queda registrado.
 *  - **R8.2**: la impersonación no permite escribir en nombre del cliente.
 */
describe('Superadmin', () => {
  let entorno: EntornoE2E;
  let app: INestApplication;
  let ds: DataSource;

  let tokenSuper: string;
  let tokenAdmin: string;

  const EMAIL_SUPER = 'super@e2e.test';
  const PLATAFORMA_ID = '00000000-0000-4000-8000-0000000000f0';

  jest.setTimeout(180_000);

  beforeAll(async () => {
    entorno = await levantarEntorno();
    app = entorno.app;
    ds = entorno.dataSource;

    // La migración no siembra el usuario si faltan las variables de entorno,
    // así que en los tests se crea acá sobre la empresa plataforma.
    await ds.query(
      'INSERT INTO `user` (`id`,`companyId`,`email`,`name`,`password`,`role`) ' +
        "VALUES (UUID(), ?, ?, 'Super', ?, 'superadmin')",
      [PLATAFORMA_ID, EMAIL_SUPER, await bcryptjs.hash(PASSWORD, 10)],
    );

    tokenSuper = await login(EMAIL_SUPER);
    tokenAdmin = await loginA(app);
  });

  afterAll(async () => {
    await cerrarEntorno(entorno);
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    return res.body.token;
  }

  const conSuper = (m: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())
      [m](url)
      .set('Authorization', `Bearer ${tokenSuper}`);

  const conAdmin = (m: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())
      [m](url)
      .set('Authorization', `Bearer ${tokenAdmin}`);

  describe('R8.1 — sólo el superadmin entra', () => {
    it.each([
      '/api/v1/superadmin/dashboard',
      '/api/v1/superadmin/companies',
      '/api/v1/superadmin/billing',
    ])('un admin de empresa recibe 403 en %s', async (url) => {
      const res = await conAdmin('get', url);
      // 403 del BACKEND, no un redirect del front.
      expect(res.status).toBe(403);
    });

    it('sin token tampoco se entra', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/superadmin/dashboard',
      );
      expect(res.status).toBe(401);
    });

    it('el superadmin ve todas las empresas', async () => {
      const res = await conSuper('get', '/api/v1/superadmin/companies');
      expect(res.status).toBe(200);

      const ids = res.body.map((c: { id: string }) => c.id);
      expect(ids).toContain(EMPRESA_A);
      expect(ids).toContain(EMPRESA_B);
    });

    it('la empresa plataforma no aparece como cliente', async () => {
      const res = await conSuper('get', '/api/v1/superadmin/companies');
      const ids = res.body.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(PLATAFORMA_ID);
    });

    it('el tablero calcula MRR y agrupa por estado', async () => {
      const res = await conSuper('get', '/api/v1/superadmin/dashboard');
      expect(res.status).toBe(200);
      expect(typeof res.body.mrr).toBe('number');
      expect(res.body.empresas).toBeGreaterThanOrEqual(2);
      expect(res.body.porEstado).toBeDefined();
    });
  });

  describe('Auditoría de las acciones', () => {
    const ultimoRegistro = async (action: string) => {
      const [fila] = await ds.query(
        'SELECT * FROM `audit_logs` WHERE `action` = ? ORDER BY `createdAt` DESC LIMIT 1',
        [action],
      );
      return fila;
    };

    it('ver la ficha de una empresa queda registrado', async () => {
      const res = await conSuper('get', `/api/v1/superadmin/companies/${EMPRESA_B}`);
      expect(res.status).toBe(200);

      const log = await ultimoRegistro('superadmin.viewed_company');
      expect(log).toBeDefined();
      expect(log.companyId).toBe(EMPRESA_B);
      expect(log.actorRole).toBe('superadmin');
    });

    it('cambiar el estado de una empresa queda registrado con el motivo', async () => {
      const res = await conSuper(
        'patch',
        `/api/v1/superadmin/companies/${EMPRESA_B}/status`,
      ).send({ status: 'defaulter', motivo: 'Falta de pago de agosto' });

      expect(res.status).toBe(200);
      expect(res.body.anterior).toBe('active');
      expect(res.body.actual).toBe('defaulter');

      const log = await ultimoRegistro('company.status_changed');
      const meta = JSON.parse(log.metadata);
      expect(meta.de).toBe('active');
      expect(meta.a).toBe('defaulter');
      expect(meta.motivo).toBe('Falta de pago de agosto');

      // Se deja como estaba para no afectar a los tests que siguen.
      await conSuper(
        'patch',
        `/api/v1/superadmin/companies/${EMPRESA_B}/status`,
      ).send({ status: 'active' });
    });

    it('cambiar un plan queda registrado y se refleja en el cliente', async () => {
      const res = await conSuper(
        'patch',
        `/api/v1/superadmin/companies/${EMPRESA_A}/plan`,
      ).send({ planCode: 'corporate', motivo: 'Upgrade comercial' });

      expect(res.status).toBeLessThan(300);

      const log = await ultimoRegistro('company.plan_changed');
      expect(log.companyId).toBe(EMPRESA_A);

      // Criterio de aceptación: el cliente lo ve sin volver a loguearse.
      const { PlanContextService } = await import(
        'src/plans/plan-context.service'
      );
      app.get(PlanContextService).invalidarTodo();

      const sesion = await conAdmin('get', '/api/v1/auth/session');
      expect(sesion.body.plan.code).toBe('corporate');
    });

    it('editar un plan del catálogo se registra como acción global', async () => {
      const res = await conSuper('patch', '/api/v1/superadmin/plans/control').send(
        { baseFee: 61000 },
      );
      expect(res.status).toBe(200);
      expect(Number(res.body.baseFee)).toBe(61000);

      const log = await ultimoRegistro('plan.updated');
      // Sin empresa: no es de ningún cliente.
      expect(log.companyId).toBeNull();
    });

    it('un admin de empresa sólo ve la auditoría de su empresa', async () => {
      const res = await conAdmin('get', `/api/v1/audit-log?companyId=${EMPRESA_B}`);
      expect(res.status).toBe(200);

      // Pidió la de OTRA empresa: el filtro sale del token, no del parámetro.
      const ajenos = res.body.filter(
        (l: { companyId: string }) => l.companyId !== EMPRESA_A,
      );
      expect(ajenos).toEqual([]);
    });
  });

  describe('R8.2 — la impersonación no permite escribir', () => {
    let tokenImpersonado: string;

    beforeAll(async () => {
      const res = await conSuper(
        'post',
        `/api/v1/superadmin/companies/${EMPRESA_B}/impersonate`,
      ).send({ motivo: 'El cliente reporta que no ve sus viajes' });

      expect(res.status).toBe(201);
      tokenImpersonado = res.body.token;
    });

    const impersonado = (m: 'get' | 'post', url: string) =>
      request(app.getHttpServer())
        [m](url)
        .set('Authorization', `Bearer ${tokenImpersonado}`);

    it('permite LEER los datos del cliente', async () => {
      const res = await impersonado('get', '/api/v1/trucks');
      expect(res.status).toBe(200);
      // Y ve los de la empresa suplantada, no los de otra.
      const internos = res.body.items.map(
        (t: { internalNumber: string }) => t.internalNumber,
      );
      expect(internos).toContain('INT-B');
    });

    it('RECHAZA cualquier escritura', async () => {
      const res = await impersonado('post', '/api/v1/trucks').send({
        plate: `IMP${Date.now() % 10000}`,
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('IMPERSONATION_READ_ONLY');
    });

    it('el token declara que es una suplantación, para el banner del front', () => {
      const payload = JSON.parse(
        Buffer.from(tokenImpersonado.split('.')[1], 'base64').toString(),
      );
      expect(payload.impersonating).toBe(true);
      expect(payload.impersonatedBy).toBeTruthy();
      expect(payload.companyId).toBe(EMPRESA_B);
    });

    it('el token es de vida corta', () => {
      const payload = JSON.parse(
        Buffer.from(tokenImpersonado.split('.')[1], 'base64').toString(),
      );
      const duracionMin = (payload.exp - payload.iat) / 60;
      expect(duracionMin).toBeLessThanOrEqual(30);
    });

    it('el inicio quedó auditado con el motivo', async () => {
      const [log] = await ds.query(
        'SELECT * FROM `audit_logs` WHERE `action` = ? ORDER BY `createdAt` DESC LIMIT 1',
        ['superadmin.impersonation_started'],
      );
      expect(log.companyId).toBe(EMPRESA_B);
      const meta = JSON.parse(log.metadata);
      expect(meta.motivo).toContain('no ve sus viajes');
    });
  });
});
