import { INestApplication } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  EMPRESA_A,
  EMPRESA_B,
  cerrarEntorno,
  levantarEntorno,
  type EntornoE2E,
} from './helpers/entorno-e2e';

/**
 * Mercado Pago simulado.
 *
 * Los tests no salen a internet: se responde lo que respondería MP. Lo que se
 * verifica no es el SDK —eso es de MP— sino **lo nuestro**: que un aviso
 * repetido no acredite dos veces, que el estado se lea de la API y no del
 * cuerpo del webhook, y que la cuenta se desbloquee sola al acreditarse.
 *
 * Los nombres empiezan con `mock` porque `jest.mock` se iza por encima de las
 * declaraciones y sólo deja usar variables con ese prefijo dentro de la fábrica.
 */
const mockPagos = new Map<string, Record<string, unknown>>();
const mockPreapprovals = new Map<string, Record<string, unknown>>();
const mockPreferencias: Record<string, unknown>[] = [];

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn().mockImplementation(() => ({})),
  Preference: jest.fn().mockImplementation(() => ({
    create: jest.fn(async ({ body }: { body: Record<string, unknown> }) => {
      mockPreferencias.push(body);
      return {
        id: `pref-${mockPreferencias.length}`,
        init_point: `https://mp.test/checkout/pref-${mockPreferencias.length}`,
        sandbox_init_point: `https://sandbox.mp.test/pref-${mockPreferencias.length}`,
      };
    }),
  })),
  PreApproval: jest.fn().mockImplementation(() => ({
    create: jest.fn(async ({ body }: { body: Record<string, unknown> }) => {
      const id = `preapp-${mockPreapprovals.size + 1}`;
      mockPreapprovals.set(id, {
        id,
        status: 'pending',
        external_reference: body.external_reference,
      });
      return { id, init_point: `https://mp.test/subscribe/${id}` };
    }),
    get: jest.fn(async ({ id }: { id: string }) => mockPreapprovals.get(id)),
    update: jest.fn(
      async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
        const actual = mockPreapprovals.get(id) ?? { id };
        const nuevo = { ...actual, ...body };
        mockPreapprovals.set(id, nuevo);
        return nuevo;
      },
    ),
  })),
  Payment: jest.fn().mockImplementation(() => ({
    get: jest.fn(async ({ id }: { id: string }) => {
      const pago = mockPagos.get(String(id));
      if (!pago) throw new Error(`Pago inexistente en MP: ${id}`);
      return pago;
    }),
  })),
}));

/**
 * Cobro por Mercado Pago y ciclo de mora (fase 9).
 *
 * Cubre los cuatro criterios de aceptación de la fase:
 *
 *  1. Una empresa completa el ciclo entero sin intervención.
 *  2. Un aviso duplicado de MP no genera un segundo pago.
 *  3. Una empresa en mora se bloquea y se desbloquea sola al pagar.
 *  4. Los crons son idempotentes.
 */
describe('Cobranza y Mercado Pago', () => {
  let entorno: EntornoE2E;
  let app: INestApplication;
  let ds: DataSource;

  jest.setTimeout(180_000);

  beforeAll(async () => {
    // Se define antes de levantar: el servicio crea los clientes de MP al
    // primer uso y sin token responde 503.
    process.env.MP_ACCESS_TOKEN = 'TEST-token-e2e';
    process.env.BACK_URL = 'http://localhost:3000/';
    process.env.FRONT_URL = 'http://localhost:3001';

    entorno = await levantarEntorno();
    app = entorno.app;
    ds = entorno.dataSource;

    // Ningún test manda correo de verdad: el SMTP de desarrollo tardaría en
    // fallar y ensuciaría los tiempos.
    jest
      .spyOn(app.get(MailerService), 'sendMail')
      .mockResolvedValue(undefined as never);
  });

  afterAll(async () => {
    await cerrarEntorno(entorno);
  });

  // ── Utilidades ─────────────────────────────────────────────────────────

  const avisoDeMp = (type: string, id: string) =>
    request(app.getHttpServer())
      .post('/api/v1/webhooks/mercadopago')
      .send({ type, data: { id } });

  /**
   * Inserta un período ya emitido, con la fecha de vencimiento que haga falta.
   *
   * Se escribe directo en la base en vez de usar `BillingService.emitirPeriodo`
   * porque lo que hace falta acá es **una deuda vencida en una fecha concreta**,
   * y la emisión real siempre vence dentro de diez días. La emisión tiene sus
   * propios tests más abajo.
   */
  async function emitirPeriodo(
    companyId: string,
    periodStart: string,
    amount: number,
    expiration: string,
  ): Promise<string> {
    const [{ id }] = await ds.query('SELECT UUID() AS id');
    const periodEnd = new Date(`${periodStart}T00:00:00`);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);

    await ds.query(
      'INSERT INTO `subscriptions` (`id`,`companyId`,`periodStart`,`periodEnd`,' +
        '`expiration`,`amount`,`status`,`isProrated`,`isPaid`) ' +
        "VALUES (?,?,?,?,?,?,'issued',0,0)",
      [
        id,
        companyId,
        periodStart,
        periodEnd.toISOString().slice(0, 10),
        expiration,
        amount,
      ],
    );
    return id;
  }

  const estadoDe = async (companyId: string): Promise<string> => {
    const [c] = await ds.query(
      'SELECT `status` FROM `companies` WHERE `id` = ?',
      [companyId],
    );
    return c.status;
  };

  const periodo = async (id: string) => {
    const [s] = await ds.query(
      'SELECT `isPaid`, `status`, `amount` FROM `subscriptions` WHERE `id` = ?',
      [id],
    );
    return s;
  };

  const pagosDe = async (subscriptionId: string): Promise<number> => {
    const [{ n }] = await ds.query(
      'SELECT COUNT(*) AS n FROM `payments` WHERE `subscriptionId` = ?',
      [subscriptionId],
    );
    return Number(n);
  };

  // ── 1. Ciclo entero ────────────────────────────────────────────────────

  describe('Ciclo completo: emisión → pago → webhook → acreditado', () => {
    let subscriptionId: string;

    beforeAll(async () => {
      subscriptionId = await emitirPeriodo(
        EMPRESA_A,
        '2026-08-01',
        150000,
        '2026-08-11',
      );

      mockPagos.set('mp-ciclo-1', {
        id: 'mp-ciclo-1',
        status: 'approved',
        external_reference: subscriptionId,
        transaction_amount: 150000,
        date_approved: '2026-08-05T10:00:00.000-03:00',
      });
    });

    it('acredita el período con el aviso de MP, sin intervención', async () => {
      const res = await avisoDeMp('payment', 'mp-ciclo-1').expect(200);

      expect(res.body).toMatchObject({ received: true, procesado: true });

      const sub = await periodo(subscriptionId);
      expect(Number(sub.isPaid)).toBe(1);
      expect(sub.status).toBe('paid');
      expect(await pagosDe(subscriptionId)).toBe(1);
    });

    it('registra el pago con su identificador de MP y el medio correcto', async () => {
      const [pago] = await ds.query(
        'SELECT `mpPaymentId`, `method`, `status`, `amount` FROM `payments` WHERE `subscriptionId` = ?',
        [subscriptionId],
      );

      expect(pago.mpPaymentId).toBe('mp-ciclo-1');
      expect(pago.method).toBe('mercadopago');
      expect(pago.status).toBe('paid');
      expect(Number(pago.amount)).toBe(150000);
    });

    it('deja el aviso registrado como procesado', async () => {
      const [evento] = await ds.query(
        'SELECT `processedAt`, `error` FROM `mp_webhook_events` WHERE `resourceId` = ?',
        ['mp-ciclo-1'],
      );

      expect(evento.processedAt).not.toBeNull();
      expect(evento.error).toBeNull();
    });

    // ── 2. Duplicado ─────────────────────────────────────────────────────

    it('un aviso repetido de MP no genera un segundo pago (R9.2)', async () => {
      const res = await avisoDeMp('payment', 'mp-ciclo-1').expect(200);

      expect(res.body).toMatchObject({ duplicado: true, procesado: false });
      expect(await pagosDe(subscriptionId)).toBe(1);
    });

    it('la base rechaza dos pagos con el mismo id de MP', async () => {
      await expect(
        ds.query(
          'INSERT INTO `payments` (`id`,`companyId`,`subscriptionId`,`paidAt`,`amount`,`method`,`status`,`mpPaymentId`) ' +
            "VALUES (UUID(),?,?,'2026-08-05',150000,'mercadopago','paid','mp-ciclo-1')",
          [EMPRESA_A, subscriptionId],
        ),
      ).rejects.toThrow();
    });
  });

  // ── 3. Mora, bloqueo y desbloqueo ──────────────────────────────────────

  describe('Mora, bloqueo y regularización', () => {
    let subscriptionId: string;
    let dunning: import('src/billing/dunning.service').DunningService;

    const HOY = new Date('2026-09-15T05:00:00');

    beforeAll(async () => {
      const { DunningService } = await import('src/billing/dunning.service');
      dunning = app.get(DunningService);

      // Un período de la empresa B vencido el 10, con la empresa al día.
      subscriptionId = await emitirPeriodo(
        EMPRESA_B,
        '2026-09-01',
        200000,
        '2026-09-10',
      );
      await ds.query(
        "UPDATE `companies` SET `status` = 'active', `defaultedAt` = NULL WHERE `id` = ?",
        [EMPRESA_B],
      );
    });

    it('el vencimiento sin pago pasa la cuenta a mora', async () => {
      expect(await dunning.marcarMorosas(HOY)).toBe(1);
      expect(await estadoDe(EMPRESA_B)).toBe('defaulter');
    });

    it('no la bloquea dentro de los días de gracia', async () => {
      expect(await dunning.bloquearMorosas(HOY)).toBe(0);
      expect(await estadoDe(EMPRESA_B)).toBe('defaulter');
    });

    it('avisa al superadmin el día anterior al bloqueo (R9.3)', async () => {
      const vispera = new Date('2026-09-24T05:00:00');
      expect(await dunning.avisarBloqueosInminentes(vispera)).toBe(1);
    });

    it('la bloquea al agotarse la gracia', async () => {
      const pasadaLaGracia = new Date('2026-09-26T05:00:00');

      expect(await dunning.bloquearMorosas(pasadaLaGracia)).toBe(1);
      expect(await estadoDe(EMPRESA_B)).toBe('blocked');
    });

    it('bloqueada, sigue pudiendo consultar y pagar su plan', async () => {
      // La lista blanca del AccountStatusGuard cubre `/billing`: sin eso, una
      // cuenta suspendida no tendría manera de salir del bloqueo.
      const { loginB } = await import('./helpers/entorno-e2e');
      const token = await loginB(app);

      await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'V-BLOQUEADA', origin: 'A', destination: 'B' })
        .expect(403);
    });

    it('se desbloquea sola al acreditarse el pago', async () => {
      mockPagos.set('mp-mora-1', {
        id: 'mp-mora-1',
        status: 'approved',
        external_reference: EMPRESA_B, // débito automático: la referencia es la empresa
        transaction_amount: 200000,
        date_approved: '2026-09-26T10:00:00.000-03:00',
      });

      await avisoDeMp('payment', 'mp-mora-1').expect(200);

      expect(Number((await periodo(subscriptionId)).isPaid)).toBe(1);
      expect(await estadoDe(EMPRESA_B)).toBe('active');

      const [c] = await ds.query(
        'SELECT `defaultedAt` FROM `companies` WHERE `id` = ?',
        [EMPRESA_B],
      );
      expect(c.defaultedAt).toBeNull();
    });

    it('un pago que no cubre el período no levanta el bloqueo', async () => {
      const parcial = await emitirPeriodo(
        EMPRESA_B,
        '2026-10-01',
        200000,
        '2026-10-10',
      );
      await ds.query("UPDATE `companies` SET `status` = 'blocked' WHERE `id` = ?", [
        EMPRESA_B,
      ]);

      mockPagos.set('mp-parcial', {
        id: 'mp-parcial',
        status: 'approved',
        external_reference: parcial,
        transaction_amount: 50000,
        date_approved: '2026-10-05T10:00:00.000-03:00',
      });

      await avisoDeMp('payment', 'mp-parcial').expect(200);

      expect(Number((await periodo(parcial)).isPaid)).toBe(0);
      expect(await estadoDe(EMPRESA_B)).toBe('blocked');
      // Igual queda registrado: es lo que permite explicarle al cliente qué
      // pasó con su intento en lugar de decirle que no pagó.
      expect(await pagosDe(parcial)).toBe(1);
    });
  });

  // ── 4. Idempotencia ────────────────────────────────────────────────────

  describe('Idempotencia de los crons y de la emisión', () => {
    it('correr el ciclo de mora dos veces no cambia el reloj de la gracia', async () => {
      const [antes] = await ds.query(
        'SELECT `defaultedAt` FROM `companies` WHERE `id` = ?',
        [EMPRESA_A],
      );

      const { DunningService } = await import('src/billing/dunning.service');
      const dunning = app.get(DunningService);
      const cuando = new Date('2026-11-20T05:00:00');

      // La empresa A ya pagó todo: no hay nada que marcar, dos veces.
      expect(await dunning.marcarMorosas(cuando)).toBe(0);
      expect(await dunning.marcarMorosas(cuando)).toBe(0);

      const [despues] = await ds.query(
        'SELECT `defaultedAt` FROM `companies` WHERE `id` = ?',
        [EMPRESA_A],
      );
      expect(despues.defaultedAt).toEqual(antes.defaultedAt);
    });

    it('emitir el mismo período dos veces emite uno solo', async () => {
      const { BillingService } = await import('src/billing/billing.service');
      const { runAsCompany } = await import('src/common/tenant/tenant-context');
      const billing = app.get(BillingService);

      const inicio = new Date('2026-12-01T00:00:00');
      const fin = new Date('2026-12-31T00:00:00');

      const primera = await runAsCompany(EMPRESA_A, () =>
        billing.emitirPeriodo(EMPRESA_A, inicio, fin),
      );
      const segunda = await runAsCompany(EMPRESA_A, () =>
        billing.emitirPeriodo(EMPRESA_A, inicio, fin),
      );

      expect(primera).not.toBeNull();
      expect(segunda).toBeNull();

      const [{ n }] = await ds.query(
        'SELECT COUNT(*) AS n FROM `subscriptions` WHERE `companyId` = ? AND `periodStart` = ?',
        [EMPRESA_A, '2026-12-01'],
      );
      expect(Number(n)).toBe(1);
    });

    it('la base rechaza un segundo período idéntico (R9.1)', async () => {
      await expect(
        ds.query(
          'INSERT INTO `subscriptions` (`id`,`companyId`,`periodStart`,`periodEnd`,' +
            '`expiration`,`amount`,`status`,`isProrated`,`isPaid`) ' +
            "VALUES (UUID(),?, '2026-12-01','2026-12-31','2027-01-10',999,'issued',0,0)",
          [EMPRESA_A],
        ),
      ).rejects.toThrow();
    });

    it('pero admite varios prorrateos el mismo día', async () => {
      // Un upgrade de plan y un alta de add-on la misma tarde son dos cargos
      // legítimos con la misma fecha: la unicidad no puede impedirlos.
      const insertarProrrateo = () =>
        ds.query(
          'INSERT INTO `subscriptions` (`id`,`companyId`,`periodStart`,`periodEnd`,' +
            '`expiration`,`amount`,`status`,`isProrated`,`isPaid`) ' +
            "VALUES (UUID(),?, '2026-12-15','2026-12-31','2027-01-10',5000,'issued',1,0)",
          [EMPRESA_A],
        );

      await expect(insertarProrrateo()).resolves.toBeDefined();
      await expect(insertarProrrateo()).resolves.toBeDefined();
    });
  });

  // ── Débito automático ──────────────────────────────────────────────────

  describe('Débito automático', () => {
    it('no se puede activar con deuda pendiente', async () => {
      const { loginA } = await import('./helpers/entorno-e2e');
      const token = await loginA(app);

      await emitirPeriodo(EMPRESA_A, '2027-01-01', 100000, '2027-01-11');

      const res = await request(app.getHttpServer())
        .post('/api/v1/billing/mp/subscription')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain('saldar');
    });

    it('el link de pago apunta al período y no a la empresa', async () => {
      const { loginA } = await import('./helpers/entorno-e2e');
      const token = await loginA(app);

      const [sub] = await ds.query(
        "SELECT `id` FROM `subscriptions` WHERE `companyId` = ? AND `periodStart` = '2027-01-01'",
        [EMPRESA_A],
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/billing/mp/checkout/${sub.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body.url).toContain('https://mp.test/checkout/');
      // `external_reference` es lo que después permite imputar el pago sin
      // adivinar a qué período corresponde.
      const ultima = mockPreferencias[mockPreferencias.length - 1];
      expect(ultima.external_reference).toBe(sub.id);
    });

    it('un aviso de suscripción actualiza el estado del débito', async () => {
      mockPreapprovals.set('preapp-manual', {
        id: 'preapp-manual',
        status: 'authorized',
        external_reference: EMPRESA_A,
      });

      await avisoDeMp('preapproval', 'preapp-manual').expect(200);

      const [c] = await ds.query(
        'SELECT `mpPreapprovalId`, `mpPreapprovalStatus` FROM `companies` WHERE `id` = ?',
        [EMPRESA_A],
      );
      expect(c.mpPreapprovalId).toBe('preapp-manual');
      expect(c.mpPreapprovalStatus).toBe('authorized');
    });
  });

  // ── Superficie pública ─────────────────────────────────────────────────

  describe('El webhook es público pero no decide nada por sí solo', () => {
    it('acepta el aviso sin token', async () => {
      await avisoDeMp('payment', 'inexistente-en-mp').expect(500);
      // 500 a propósito: MP tiene que reintentarlo. Lo importante es que el
      // aviso no acreditó nada, porque el estado se lee de la API de MP.
    });

    it('ignora los tipos que no usamos sin romperse', async () => {
      const res = await avisoDeMp('plan', 'plan-123').expect(200);
      expect(res.body).toMatchObject({ received: true, procesado: true });
    });

    it('un aviso sin recurso se responde 200 y no hace nada', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/mercadopago')
        .send({ type: 'payment' })
        .expect(200);

      expect(res.body).toEqual({ received: true });
    });
  });
});
