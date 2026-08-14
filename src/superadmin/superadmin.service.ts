import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { MpWebhookEvent } from 'src/billing/entities/mp-webhook-event.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { BillingStatus } from 'src/common/enums/billing.enum';
import { BillingService } from 'src/billing/billing.service';
import { DunningService } from 'src/billing/dunning.service';
import { PlanContextService } from 'src/plans/plan-context.service';
import { runAsCompany, runAsSystem } from 'src/common/tenant/tenant-context';
import { calcularPrecioMensual, Prepago } from 'src/billing/pricing.util';
import {
  leerPaginacion,
  metaDePaginacion,
} from 'src/common/utils/meta-paginacion.util';

const GB = 1024 * 1024 * 1024;

/**
 * Operación de la plataforma: ver y administrar todas las empresas.
 *
 * Todo lo de acá corre en contexto de sistema, que es el único acceso legítimo
 * entre empresas del sistema. Las acciones que cambian algo se auditan desde el
 * controlador, donde está el request con IP y user agent.
 */
@Injectable()
export class SuperadminService {
  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    @InjectRepository(MpWebhookEvent)
    private readonly eventosMpRepository: Repository<MpWebhookEvent>,
    private readonly billing: BillingService,
    private readonly dunning: DunningService,
    private readonly planContext: PlanContextService,
  ) {}

  /**
   * Tablero: MRR, altas, mora y trials por vencer.
   *
   * El MRR se calcula con la **misma función** que emite las facturas
   * (`calcularPrecioMensual`), no con una consulta aparte: dos fórmulas distintas
   * para el mismo número terminan siempre en dos números distintos, y entonces
   * ninguno es confiable.
   */
  async tablero() {
    return runAsSystem(async () => {
      const empresas = await this.companiesRepository.find({
        where: { isPlatform: false },
      });
      const planes = await this.plansRepository.find();
      const porId = new Map(planes.map((p) => [p.id, p]));

      const inicioDeMes = new Date();
      inicioDeMes.setDate(1);
      inicioDeMes.setHours(0, 0, 0, 0);

      const en7Dias = new Date();
      en7Dias.setDate(en7Dias.getDate() + 7);

      let mrr = 0;
      let altasDelMes = 0;
      const porEstado: Record<string, number> = {};
      const porPlan: Record<string, number> = {};
      const trialsPorVencer: {
        id: string;
        name: string;
        trialEndsAt: Date;
      }[] = [];

      for (const c of empresas) {
        porEstado[c.status] = (porEstado[c.status] ?? 0) + 1;

        const plan = c.planId ? porId.get(c.planId) : undefined;
        if (plan) porPlan[plan.code] = (porPlan[plan.code] ?? 0) + 1;

        if (new Date(c.createdAt) >= inicioDeMes) altasDelMes++;

        if (
          c.status === CompanyStatus.TRIAL &&
          c.trialEndsAt &&
          new Date(c.trialEndsAt) <= en7Dias
        ) {
          trialsPorVencer.push({
            id: c.id,
            name: c.name,
            trialEndsAt: c.trialEndsAt,
          });
        }

        // Sólo cuentan al MRR las que efectivamente facturan.
        const facturan = [
          CompanyStatus.ACTIVE,
          CompanyStatus.DEFAULTER,
          CompanyStatus.BLOCKED,
        ];
        if (!plan || !facturan.includes(c.status)) continue;

        const unidades = await this.billing.contarUnidadesHoy(c.id);
        const { facturables } = await this.billing.addonsVigentes(c.id);
        mrr += calcularPrecioMensual(
          {
            baseFee: Number(plan.baseFee),
            pricePerVehicle: Number(plan.pricePerVehicle),
            minVehicles: plan.minVehicles,
          },
          unidades,
          facturables,
          (c.prepay as Prepago) ?? Prepago.MENSUAL,
        ).amount;
      }

      return {
        empresas: empresas.length,
        mrr: Math.round(mrr * 100) / 100,
        arpu: empresas.length ? Math.round(mrr / empresas.length) : 0,
        altasDelMes,
        porEstado,
        porPlan,
        trialsPorVencer: trialsPorVencer.sort(
          (a, b) =>
            new Date(a.trialEndsAt).getTime() -
            new Date(b.trialEndsAt).getTime(),
        ),
        enMora: porEstado[CompanyStatus.DEFAULTER] ?? 0,
        bloqueadas: porEstado[CompanyStatus.BLOCKED] ?? 0,
      };
    });
  }

  /**
   * Listado de empresas con sus métricas de uso, paginado.
   *
   * La paginación no es cosmética: por cada empresa se cuentan usuarios y
   * unidades con dos consultas más, así que un listado sin techo hace crecer el
   * costo con la cartera. Con cien clientes serían doscientas consultas por
   * abrir la pantalla.
   */
  async listarEmpresas(
    filtros: {
      estado?: string;
      plan?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { page, limit, offset } = leerPaginacion(filtros.page, filtros.limit);

    return runAsSystem(async () => {
      const qb = this.companiesRepository
        .createQueryBuilder('c')
        .leftJoin(Plan, 'p', 'p.id = c.planId')
        .select([
          'c.id AS id',
          'c.name AS name',
          'c.slug AS slug',
          'c.status AS status',
          'c.createdAt AS createdAt',
          'c.trialEndsAt AS trialEndsAt',
          'c.storageBytesUsed AS storageBytesUsed',
          'p.code AS planCode',
          'p.name AS planName',
        ])
        .where('c.isPlatform = 0')
        .orderBy('c.createdAt', 'DESC');

      if (filtros.estado) qb.andWhere('c.status = :estado', { estado: filtros.estado });
      if (filtros.plan) qb.andWhere('p.code = :plan', { plan: filtros.plan });
      if (filtros.search) {
        qb.andWhere(
          '(LOWER(c.name) LIKE LOWER(:q) OR LOWER(c.slug) LIKE LOWER(:q) ' +
            'OR c.cuit LIKE :q)',
          { q: `%${filtros.search}%` },
        );
      }

      // `getCount()` sobre un query con `select` crudo cuenta filas de `c`, que
      // es lo que se quiere: el join con Plan es 1 a 1.
      const total = await qb.getCount();
      const filas = await qb.limit(limit).offset(offset).getRawMany();

      // El conteo de unidades y usuarios se hace por empresa: son consultas
      // chicas y, ya paginado, son a lo sumo dos por fila de la página visible.
      const items = await Promise.all(
        filas.map(async (f) => {
          const [{ n: usuarios }] = await this.companiesRepository.query(
            'SELECT COUNT(*) AS n FROM `user` WHERE `companyId` = ? AND `deletedAt` IS NULL',
            [f.id],
          );
          const [{ n: camiones }] = await this.companiesRepository.query(
            'SELECT COUNT(*) AS n FROM `trucks` WHERE `companyId` = ? AND `deletedAt` IS NULL AND `billingStatus` = ?',
            [f.id, BillingStatus.ACTIVE],
          );

          return {
            ...f,
            usuarios: Number(usuarios),
            camionesActivos: Number(camiones),
            storageGbUsados:
              Math.round((Number(f.storageBytesUsed) / GB) * 100) / 100,
          };
        }),
      );

      return {
        items,
        meta: metaDePaginacion(total, items.length, page, limit),
      };
    });
  }

  /** Ficha completa de una empresa. */
  async verEmpresa(companyId: string) {
    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: companyId } }),
    );
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    // La cotización y los períodos se leen EN CONTEXTO DE LA EMPRESA: así se
    // usan exactamente los mismos caminos que ve el cliente, en lugar de una
    // consulta paralela que podría dar otro número.
    return runAsCompany(companyId, async () => {
      const [cotizacion, periodos, addons] = await Promise.all([
        this.billing.cotizar(companyId).catch(() => null),
        this.billing.listarPeriodos(companyId).catch(() => []),
        this.billing.addonsDisponibles(companyId).catch(() => []),
      ]);

      return {
        company,
        cotizacion,
        periodos,
        addonsContratados: (addons as { contratado: boolean }[]).filter(
          (a) => a.contratado,
        ),
      };
    });
  }

  /** Cambia el estado comercial de una empresa. */
  async cambiarEstado(companyId: string, estado: CompanyStatus) {
    if (!Object.values(CompanyStatus).includes(estado)) {
      throw new BadRequestException('Estado inválido.');
    }

    return runAsSystem(async () => {
      const company = await this.companiesRepository.findOne({
        where: { id: companyId },
      });
      if (!company) throw new NotFoundException('Empresa no encontrada.');

      const anterior = company.status;
      company.status = estado;
      await this.companiesRepository.save(company);

      return { companyId, anterior, actual: estado };
    });
  }

  /**
   * Cambia el plan de una empresa desde el panel.
   *
   * Reutiliza el flujo de facturación —con su prorrateo y sus reglas de
   * downgrade diferido— en vez de escribir `planId` a mano: si el superadmin
   * tuviera un camino propio, terminaría facturando distinto que el cliente.
   */
  async cambiarPlan(companyId: string, planCode: string, actorId?: string) {
    return runAsCompany(companyId, () =>
      this.billing.cambiarPlan(companyId, planCode, actorId),
    );
  }

  /** Emite el período en curso a mano (cobranza manual, fase 5). */
  async emitirPeriodo(companyId: string) {
    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: companyId } }),
    );
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    return runAsCompany(companyId, () => {
      const { periodStart, periodEnd } = this.billing.periodoDe(
        new Date(),
        company.billingDay ?? 1,
      );
      return this.billing.emitirPeriodo(companyId, periodStart, periodEnd);
    });
  }

  /**
   * Marca un período como cobrado.
   *
   * Conciliar una transferencia a mano tiene que levantar el bloqueo igual que
   * lo hace un pago por Mercado Pago: para el cliente que pagó, que su plata
   * haya entrado por una vía o por otra no es una diferencia que le importe.
   */
  async marcarPagada(companyId: string, subscriptionId: string) {
    const sub = await runAsCompany(companyId, () =>
      this.billing.marcarPagada(subscriptionId),
    );

    await this.dunning.regularizar(companyId);

    return sub;
  }

  /** ABM de planes sin deploy: es el motivo de que los precios vivan en la base. */
  async actualizarPlan(code: string, datos: Partial<Plan>) {
    return runAsSystem(async () => {
      const plan = await this.plansRepository.findOne({ where: { code } });
      if (!plan) throw new NotFoundException('Plan no encontrado.');

      const permitidos: (keyof Plan)[] = [
        'name',
        'description',
        'baseFee',
        'pricePerVehicle',
        'minVehicles',
        'setupFee',
        'features',
        'limits',
        'isPublic',
        'isNegotiated',
        'sortOrder',
      ];

      for (const campo of permitidos) {
        if (datos[campo] !== undefined) {
          (plan as unknown as Record<string, unknown>)[campo] = datos[campo];
        }
      }

      const guardado = await this.plansRepository.save(plan);

      // Sin esto, las empresas seguirían viendo el plan viejo hasta 60 s.
      this.planContext.invalidarTodo();

      return guardado;
    });
  }

  /** Cobranza: períodos impagos de todas las empresas. */
  async cobranzas(filtros: { page?: number; limit?: number } = {}) {
    const { page, limit, offset } = leerPaginacion(filtros.page, filtros.limit);

    return runAsSystem(async () => {
      const [{ n: total }] = await this.companiesRepository.query(
        'SELECT COUNT(*) AS n FROM `subscriptions` s ' +
          'WHERE s.`isPaid` = 0 AND s.`deletedAt` IS NULL',
      );

      const items = await this.companiesRepository.query(
        'SELECT s.`id`, s.`companyId`, c.`name` AS companyName, s.`periodStart`, ' +
          's.`periodEnd`, s.`expiration`, s.`amount`, s.`status`, s.`isProrated` ' +
          'FROM `subscriptions` s ' +
          'JOIN `companies` c ON c.`id` = s.`companyId` ' +
          'WHERE s.`isPaid` = 0 AND s.`deletedAt` IS NULL ' +
          'ORDER BY s.`expiration` ASC ' +
          'LIMIT ? OFFSET ?',
        [limit, offset],
      );

      // Los totales se calculan sobre TODO lo impago, no sobre la página: un
      // "por cobrar" que cambia al pasar de página no es un número que sirva
      // para tomar ninguna decisión.
      const [totales] = await this.companiesRepository.query(
        'SELECT COALESCE(SUM(s.`amount`), 0) AS total, ' +
          'COALESCE(SUM(CASE WHEN s.`expiration` < CURDATE() THEN s.`amount` ELSE 0 END), 0) AS vencido ' +
          'FROM `subscriptions` s ' +
          'WHERE s.`isPaid` = 0 AND s.`deletedAt` IS NULL',
      );

      return {
        items,
        totales: {
          porCobrar: Number(totales.total),
          vencido: Number(totales.vencido),
        },
        meta: metaDePaginacion(Number(total), items.length, page, limit),
      };
    });
  }

  /**
   * Todos los pagos registrados, de cualquier empresa y por cualquier vía.
   *
   * Mezcla a propósito los cobros de Mercado Pago con las transferencias
   * conciliadas a mano: la pregunta que se responde acá —«¿entró la plata de
   * este cliente?»— no distingue por dónde entró, y tener dos listados
   * separados obliga a mirar los dos para contestarla.
   */
  async pagos(
    filtros: {
      companyId?: string;
      estado?: string;
      metodo?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { page, limit, offset } = leerPaginacion(filtros.page, filtros.limit);

    const condiciones = ['p.`deletedAt` IS NULL'];
    const params: unknown[] = [];

    if (filtros.companyId) {
      condiciones.push('p.`companyId` = ?');
      params.push(filtros.companyId);
    }
    if (filtros.estado) {
      condiciones.push('p.`status` = ?');
      params.push(filtros.estado);
    }
    if (filtros.metodo) {
      condiciones.push('p.`method` = ?');
      params.push(filtros.metodo);
    }
    if (filtros.search) {
      condiciones.push(
        '(LOWER(c.`name`) LIKE LOWER(?) OR p.`mpPaymentId` LIKE ? ' +
          'OR p.`reference` LIKE ?)',
      );
      const q = `%${filtros.search}%`;
      params.push(q, q, q);
    }

    const where = condiciones.join(' AND ');

    return runAsSystem(async () => {
      const [{ n: total }] = await this.companiesRepository.query(
        'SELECT COUNT(*) AS n FROM `payments` p ' +
          'JOIN `companies` c ON c.`id` = p.`companyId` ' +
          `WHERE ${where}`,
        params,
      );

      const items = await this.companiesRepository.query(
        'SELECT p.`id`, p.`companyId`, c.`name` AS companyName, p.`paidAt`, ' +
          'p.`amount`, p.`method`, p.`status`, p.`reference`, p.`receiptUrl`, ' +
          'p.`mpPaymentId`, p.`mpPreapprovalId`, p.`createdAt`, ' +
          's.`periodStart`, s.`periodEnd` ' +
          'FROM `payments` p ' +
          'JOIN `companies` c ON c.`id` = p.`companyId` ' +
          'LEFT JOIN `subscriptions` s ON s.`id` = p.`subscriptionId` ' +
          `WHERE ${where} ` +
          'ORDER BY p.`createdAt` DESC ' +
          'LIMIT ? OFFSET ?',
        [...params, limit, offset],
      );

      return {
        items,
        meta: metaDePaginacion(Number(total), items.length, page, limit),
      };
    });
  }

  /**
   * Avisos recibidos de Mercado Pago, con su resultado.
   *
   * Es la única ventana a los cobros que **no** terminaron de acreditarse. Un
   * aviso con `error` y sin `processedAt` es plata que el cliente pagó y el
   * sistema todavía no reconoce: mientras eso no se vea, el cliente se entera
   * primero, por un bloqueo que no le corresponde.
   */
  async avisosDeMp(
    filtros: {
      soloErrores?: boolean;
      type?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { page, limit, offset } = leerPaginacion(filtros.page, filtros.limit);

    const condiciones: string[] = [];
    const params: unknown[] = [];

    // "Pendiente" incluye tanto el que falló con un motivo escrito como el que
    // quedó a medias sin llegar a registrarlo: los dos terminan en un pago sin
    // acreditar, que es lo que se está buscando.
    if (filtros.soloErrores) condiciones.push('e.`processedAt` IS NULL');
    if (filtros.type) {
      condiciones.push('e.`type` = ?');
      params.push(filtros.type);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    return runAsSystem(async () => {
      const [{ n: total }] = await this.companiesRepository.query(
        `SELECT COUNT(*) AS n FROM \`mp_webhook_events\` e ${where}`,
        params,
      );

      const items = await this.companiesRepository.query(
        'SELECT e.`id`, e.`createdAt`, e.`type`, e.`resourceId`, ' +
          'e.`processedAt`, e.`error`, e.`companyId`, c.`name` AS companyName ' +
          'FROM `mp_webhook_events` e ' +
          'LEFT JOIN `companies` c ON c.`id` = e.`companyId` ' +
          `${where} ` +
          'ORDER BY e.`createdAt` DESC ' +
          'LIMIT ? OFFSET ?',
        [...params, limit, offset],
      );

      const [{ n: pendientes }] = await this.companiesRepository.query(
        'SELECT COUNT(*) AS n FROM `mp_webhook_events` WHERE `processedAt` IS NULL',
      );

      return {
        items,
        pendientes: Number(pendientes),
        meta: metaDePaginacion(Number(total), items.length, page, limit),
      };
    });
  }

  /** Un aviso puntual, para saber qué reprocesar. */
  async avisoDeMp(id: string): Promise<MpWebhookEvent> {
    const evento = await runAsSystem(() =>
      this.eventosMpRepository.findOne({ where: { id } }),
    );
    if (!evento) throw new NotFoundException('Aviso no encontrado.');
    return evento;
  }
}
