import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  cerrarEntorno,
  levantarEntorno,
  type EntornoE2E,
} from './helpers/entorno-e2e';

/**
 * Alta pública, invitaciones y estado de la cuenta (fase 6).
 *
 * Es el flujo por el que va a entrar **todo** cliente nuevo, así que cada bug
 * acá se replica en cada alta. Se prueba contra la aplicación real, incluidos
 * los guards.
 */
describe('Onboarding: alta, invitaciones y estado de cuenta', () => {
  let entorno: EntornoE2E;
  let app: INestApplication;
  let ds: DataSource;

  const PASSWORD = 'Passw0rd!2026';
  const sufijo = () => Math.random().toString(36).slice(2, 10);

  jest.setTimeout(180_000);

  beforeAll(async () => {
    entorno = await levantarEntorno();
    app = entorno.app;
    ds = entorno.dataSource;
  });

  afterAll(async () => {
    await cerrarEntorno(entorno);
  });

  const api = (m: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())[m](url);

  const registrar = (datos: Record<string, unknown>) =>
    api('post', '/api/v1/companies/register').send(datos);

  const login = async (email: string) => {
    const res = await api('post', '/api/v1/auth/login').send({
      email,
      password: PASSWORD,
    });
    return res.body.token as string;
  };

  describe('Alta pública', () => {
    it('crea la empresa, arranca el trial y deja entrar de una', async () => {
      const s = sufijo();
      const email = `admin-${s}@e2e.test`;

      const alta = await registrar({
        companyName: `Transportes ${s}`,
        cuit: '30712345678',
        adminName: 'Titular',
        adminEmail: email,
        adminPassword: PASSWORD,
      });

      expect(alta.status).toBe(201);
      expect(alta.body.slug).toContain('transportes');
      expect(new Date(alta.body.trialEndsAt).getTime()).toBeGreaterThan(
        Date.now(),
      );

      const token = await login(email);
      expect(token).toBeTruthy();

      const sesion = await api('get', '/api/v1/auth/session').set(
        'Authorization',
        `Bearer ${token}`,
      );

      // El trial es del plan Operación, no de Control: ancla arriba (§6.1).
      expect(sesion.body.plan.code).toBe('operacion');
      expect(sesion.body.company.status).toBe('trial');
      expect(sesion.body.company.onboardingStep).toBe(1);
    });

    it('la empresa nueva no ve datos de ninguna otra', async () => {
      const s = sufijo();
      const email = `aislada-${s}@e2e.test`;
      await registrar({
        companyName: `Aislada ${s}`,
        adminName: 'Titular',
        adminEmail: email,
        adminPassword: PASSWORD,
      });

      const token = await login(email);
      const trucks = await api('get', '/api/v1/trucks').set(
        'Authorization',
        `Bearer ${token}`,
      );

      expect(trucks.status).toBe(200);
      expect(trucks.body.items).toHaveLength(0);
    });

    it('dos empresas con el mismo nombre no colisionan de slug', async () => {
      const s = sufijo();
      const nombre = `Homonima ${s}`;

      const a = await registrar({
        companyName: nombre,
        adminName: 'A',
        adminEmail: `h1-${s}@e2e.test`,
        adminPassword: PASSWORD,
      });
      const b = await registrar({
        companyName: nombre,
        adminName: 'B',
        adminEmail: `h2-${s}@e2e.test`,
        adminPassword: PASSWORD,
      });

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(b.body.slug).not.toBe(a.body.slug);
    });

    it('rechaza un email ya registrado con 409 y mensaje claro', async () => {
      const s = sufijo();
      const email = `dup-${s}@e2e.test`;
      await registrar({
        companyName: `Primera ${s}`,
        adminName: 'A',
        adminEmail: email,
        adminPassword: PASSWORD,
      });

      const segunda = await registrar({
        companyName: `Segunda ${s}`,
        adminName: 'B',
        adminEmail: email,
        adminPassword: PASSWORD,
      });

      expect(segunda.status).toBe(409);
      expect(segunda.body.message).toMatch(/ya existe una cuenta/i);
    });

    it('R6.2: un alta rechazada no deja la empresa a medio crear', async () => {
      const s = sufijo();
      const email = `orf-${s}@e2e.test`;
      await registrar({
        companyName: `Original ${s}`,
        adminName: 'A',
        adminEmail: email,
        adminPassword: PASSWORD,
      });

      const [{ n: antes }] = await ds.query(
        'SELECT COUNT(*) AS n FROM `companies`',
      );

      await registrar({
        companyName: `Huerfana ${s}`,
        adminName: 'B',
        adminEmail: email, // ya usado: falla
        adminPassword: PASSWORD,
      });

      const [{ n: despues }] = await ds.query(
        'SELECT COUNT(*) AS n FROM `companies`',
      );
      expect(Number(despues)).toBe(Number(antes));
    });

    it('valida los datos obligatorios', async () => {
      const res = await registrar({ companyName: '', adminEmail: 'no-es-mail' });
      expect(res.status).toBe(400);
    });
  });

  describe('Invitaciones', () => {
    let token: string;
    let s: string;

    beforeAll(async () => {
      s = sufijo();
      await registrar({
        companyName: `Invitadora ${s}`,
        adminName: 'Titular',
        adminEmail: `inv-${s}@e2e.test`,
        adminPassword: PASSWORD,
      });
      token = await login(`inv-${s}@e2e.test`);
    });

    it('el invitado queda en la empresa correcta', async () => {
      const emailChofer = `chofer-${s}@e2e.test`;

      const inv = await api('post', '/api/v1/invites')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: emailChofer, name: 'Chofer', role: 'driver' });
      expect(inv.status).toBe(201);

      // La pantalla pública muestra a qué empresa lo invitan.
      const ver = await api('get', `/api/v1/invites/token/${inv.body.token}`);
      expect(ver.status).toBe(200);
      expect(ver.body.companyName).toContain('Invitadora');
      expect(ver.body.role).toBe('driver');

      const aceptar = await api(
        'post',
        `/api/v1/invites/token/${inv.body.token}/accept`,
      ).send({ password: PASSWORD });
      expect(aceptar.status).toBe(201);

      // Entra, y en la empresa de quien lo invitó.
      const tokenChofer = await login(emailChofer);
      const payload = JSON.parse(
        Buffer.from(tokenChofer.split('.')[1], 'base64').toString(),
      );

      const [empresa] = await ds.query(
        'SELECT `id` FROM `companies` WHERE `slug` LIKE ?',
        [`invitadora-${s}%`],
      );
      expect(payload.companyId).toBe(empresa.id);
      expect(payload.role).toBe('driver');
    });

    it('un token ya usado da un mensaje específico, no un error genérico', async () => {
      const inv = await api('post', '/api/v1/invites')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: `usado-${s}@e2e.test`, role: 'driver' });

      await api('post', `/api/v1/invites/token/${inv.body.token}/accept`).send({
        password: PASSWORD,
      });

      const reuso = await api(
        'post',
        `/api/v1/invites/token/${inv.body.token}/accept`,
      ).send({ password: PASSWORD });

      expect(reuso.status).toBe(400);
      expect(reuso.body.message).toMatch(/ya fue usada/i);
    });

    it('un token vencido avisa que hay que pedir otro', async () => {
      const inv = await api('post', '/api/v1/invites')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: `venc-${s}@e2e.test`, role: 'driver' });

      await ds.query(
        'UPDATE `invites` SET `expiresAt` = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE `token` = ?',
        [inv.body.token],
      );

      const ver = await api('get', `/api/v1/invites/token/${inv.body.token}`);
      expect(ver.status).toBe(400);
      expect(ver.body.message).toMatch(/venció/i);
    });

    it('un token inexistente da 404 y no un 500', async () => {
      const ver = await api(
        'get',
        '/api/v1/invites/token/00000000-0000-4000-8000-000000000000',
      );
      expect(ver.status).toBe(404);
    });

    it('no se puede invitar a un rol que el plan no incluye', async () => {
      // Se baja la empresa a Control, que no tiene auditoría.
      await ds.query(
        "UPDATE `companies` SET `planId` = (SELECT `id` FROM `plans` WHERE `code` = 'control') WHERE `slug` LIKE ?",
        [`invitadora-${s}%`],
      );
      const { PlanContextService } = await import(
        'src/plans/plan-context.service'
      );
      app.get(PlanContextService).invalidarTodo();

      const inv = await api('post', '/api/v1/invites')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: `aud-${s}@e2e.test`, role: 'auditor' });

      expect(inv.status).toBe(400);
      expect(inv.body.error).toBe('ROLE_NOT_IN_PLAN');
    });
  });

  describe('Estado de la cuenta (D6)', () => {
    let token: string;
    let companyId: string;

    beforeAll(async () => {
      const s = sufijo();
      const email = `estado-${s}@e2e.test`;
      const alta = await registrar({
        companyName: `Estado ${s}`,
        adminName: 'Titular',
        adminEmail: email,
        adminPassword: PASSWORD,
      });
      companyId = alta.body.companyId;
      token = await login(email);
    });

    const conEstado = async (estado: string) => {
      await ds.query('UPDATE `companies` SET `status` = ? WHERE `id` = ?', [
        estado,
        companyId,
      ]);
    };

    it('BLOCKED deja leer pero no escribir', async () => {
      await conEstado('blocked');

      const lectura = await api('get', '/api/v1/trucks').set(
        'Authorization',
        `Bearer ${token}`,
      );
      expect(lectura.status).toBe(200);

      const escritura = await api('post', '/api/v1/trucks')
        .set('Authorization', `Bearer ${token}`)
        .send({ plate: `BLK${Date.now() % 10000}` });
      expect(escritura.status).toBe(403);
      expect(escritura.body.error).toBe('ACCOUNT_BLOCKED');
    });

    it('BLOCKED deja ver la facturación: es cómo se sale del bloqueo', async () => {
      await conEstado('blocked');
      const res = await api('get', '/api/v1/billing/quote').set(
        'Authorization',
        `Bearer ${token}`,
      );
      expect(res.status).toBe(200);
    });

    it('CANCELLED corta el acceso por completo', async () => {
      await conEstado('cancelled');
      const res = await api('get', '/api/v1/trucks').set(
        'Authorization',
        `Bearer ${token}`,
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('ACCOUNT_CANCELLED');
    });

    it('el cron pasa a BLOCKED los trials vencidos, con días de gracia', async () => {
      const { CompanyStatusCron } = await import(
        'src/companies/company-status.cron'
      );
      const cron = app.get(CompanyStatusCron);

      // Vencido ayer: todavía dentro de la gracia, no se toca.
      await ds.query(
        "UPDATE `companies` SET `status` = 'trial', `trialEndsAt` = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE `id` = ?",
        [companyId],
      );
      await cron.vencerTrials();
      let [fila] = await ds.query(
        'SELECT `status` FROM `companies` WHERE `id` = ?',
        [companyId],
      );
      expect(fila.status).toBe('trial');

      // Vencido hace 10 días: se suspende.
      await ds.query(
        "UPDATE `companies` SET `trialEndsAt` = DATE_SUB(NOW(), INTERVAL 10 DAY) WHERE `id` = ?",
        [companyId],
      );
      await cron.vencerTrials();
      [fila] = await ds.query(
        'SELECT `status` FROM `companies` WHERE `id` = ?',
        [companyId],
      );
      expect(fila.status).toBe('blocked');
    });
  });
});
