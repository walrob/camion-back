import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import {
  BillingStatus,
  PlanUpdateStatus,
  PlanUpdateType,
  SubscriptionStatus,
} from 'src/common/enums/billing.enum';
import { Subscription } from './entities/subscription.entity';
import { CompanyAddon } from './entities/company-addon.entity';
import { VehicleBillingSnapshot } from './entities/vehicle-billing-snapshot.entity';
import { CompanyPlanUpdate } from './entities/company-plan-update.entity';
import { PlanContextService } from 'src/plans/plan-context.service';
import { LimitsService } from 'src/plans/limits.service';
import {
  AddonFacturable,
  Prepago,
  UnidadesFacturables,
  calcularPrecioMensual,
  calcularProrrateo,
} from './pricing.util';

/** Días de plazo para pagar antes de que el período pase a vencido. */
const DIAS_VENCIMIENTO = 10;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    @InjectRepository(Trailer)
    private readonly trailersRepository: Repository<Trailer>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(CompanyAddon)
    private readonly companyAddonsRepository: Repository<CompanyAddon>,
    @InjectRepository(VehicleBillingSnapshot)
    private readonly snapshotsRepository: Repository<VehicleBillingSnapshot>,
    @InjectRepository(CompanyPlanUpdate)
    private readonly updatesRepository: Repository<CompanyPlanUpdate>,
    // Al aplicar un downgrade hay que releer el plan y recortar el excedente.
    private readonly planContext: PlanContextService,
    private readonly limitsService: LimitsService,
  ) {}

  // ─────────────────────────── Unidades facturables ──────────────────────────

  /** Conteo de unidades de una empresa AHORA, para el snapshot diario. */
  async contarUnidadesHoy(companyId: string): Promise<UnidadesFacturables> {
    const [activeTrucks, inactiveTrucks, activeTrailers, inactiveTrailers] =
      await Promise.all([
        this.trucksRepository.count({
          where: { companyId, billingStatus: BillingStatus.ACTIVE },
        }),
        this.trucksRepository.count({
          where: { companyId, billingStatus: BillingStatus.INACTIVE },
        }),
        this.trailersRepository.count({
          where: { companyId, billingStatus: BillingStatus.ACTIVE },
        }),
        this.trailersRepository.count({
          where: { companyId, billingStatus: BillingStatus.INACTIVE },
        }),
      ]);

    return { activeTrucks, inactiveTrucks, activeTrailers, inactiveTrailers };
  }

  /** Guarda (o pisa) la foto del día. Idempotente: se puede correr varias veces. */
  async registrarSnapshot(companyId: string, fecha = new Date()): Promise<void> {
    const date = this.soloFecha(fecha);
    const unidades = await this.contarUnidadesHoy(companyId);

    const existente = await this.snapshotsRepository.findOne({
      where: { companyId, date: date as unknown as Date },
    });

    if (existente) {
      Object.assign(existente, unidades);
      await this.snapshotsRepository.save(existente);
      return;
    }

    await this.snapshotsRepository.save(
      this.snapshotsRepository.create({
        companyId,
        date: date as unknown as Date,
        ...unidades,
      }),
    );
  }

  /**
   * Máximo simultáneo de cada tipo de unidad en el período (§2.3).
   *
   * Se toma el MÁXIMO y no el promedio ni el último día: si se mirara el cierre,
   * bastaría con dar de baja las unidades el día 30 para no pagarlas.
   *
   * Si no hay snapshots (empresa recién dada de alta, o el cron no corrió) se
   * cae al conteo actual: es preferible facturar por lo que hay hoy que emitir
   * un período en cero.
   */
  async unidadesDelPeriodo(
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UnidadesFacturables> {
    const filas: {
      activeTrucks: number | null;
      inactiveTrucks: number | null;
      activeTrailers: number | null;
      inactiveTrailers: number | null;
    }[] = await this.snapshotsRepository.query(
      'SELECT MAX(`activeTrucks`) AS activeTrucks, MAX(`inactiveTrucks`) AS inactiveTrucks, ' +
        'MAX(`activeTrailers`) AS activeTrailers, MAX(`inactiveTrailers`) AS inactiveTrailers ' +
        'FROM `vehicle_billing_snapshots` ' +
        'WHERE `companyId` = ? AND `date` BETWEEN ? AND ?',
      [companyId, this.soloFecha(periodStart), this.soloFecha(periodEnd)],
    );

    const fila = filas[0];
    if (!fila || fila.activeTrucks === null) {
      return this.contarUnidadesHoy(companyId);
    }

    return {
      activeTrucks: Number(fila.activeTrucks ?? 0),
      inactiveTrucks: Number(fila.inactiveTrucks ?? 0),
      activeTrailers: Number(fila.activeTrailers ?? 0),
      inactiveTrailers: Number(fila.inactiveTrailers ?? 0),
    };
  }

  // ────────────────────────────── Add-ons ────────────────────────────────────

  /** Add-ons vigentes de una empresa a una fecha, ya resueltos a números. */
  async addonsVigentes(
    companyId: string,
    fecha = new Date(),
  ): Promise<{ facturables: AddonFacturable[]; features: string[] }> {
    const contratados = await this.companyAddonsRepository.find({
      where: { companyId },
      relations: ['addon'],
    });

    const facturables: AddonFacturable[] = [];
    const features: string[] = [];

    for (const c of contratados) {
      if (!c.addon || c.addon.isOneTime) continue;
      if (c.startedAt && new Date(c.startedAt) > fecha) continue;
      if (c.endedAt && new Date(c.endedAt) <= fecha) continue;

      facturables.push({
        code: c.addon.code,
        name: c.addon.name,
        monthlyPrice: Number(c.addon.monthlyPrice),
        pricePerVehicle: Number(c.addon.pricePerVehicle),
        quantity: c.quantity,
      });
      features.push(...(c.addon.features ?? []));
    }

    return { facturables, features };
  }

  // ──────────────────────────── Emisión ──────────────────────────────────────

  /**
   * Precio que le corresponde HOY a una empresa, sin emitir nada.
   * Lo usa el prorrateo y la vista previa del superadmin.
   */
  async cotizar(companyId: string, fecha = new Date()) {
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company?.planId) {
      throw new BadRequestException('La empresa no tiene plan asignado.');
    }

    const plan = await this.plansRepository.findOne({
      where: { id: company.planId },
    });
    if (!plan) throw new BadRequestException('Plan inexistente.');

    const unidades = await this.contarUnidadesHoy(companyId);
    const { facturables } = await this.addonsVigentes(companyId, fecha);

    return {
      company,
      plan,
      unidades,
      desglose: calcularPrecioMensual(
        {
          baseFee: Number(plan.baseFee),
          pricePerVehicle: Number(plan.pricePerVehicle),
        },
        unidades,
        facturables,
        (company.prepay as Prepago) ?? Prepago.MENSUAL,
      ),
    };
  }

  /**
   * Emite el período de una empresa.
   *
   * Es **idempotente por período**: si ya existe una suscripción no prorrateada
   * para ese `periodStart`, no emite otra. Sin esto, dos corridas del cron el
   * mismo día facturarían dos veces.
   */
  async emitirPeriodo(
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Subscription | null> {
    const yaEmitida = await this.subscriptionsRepository.findOne({
      where: {
        companyId,
        periodStart: this.soloFecha(periodStart) as unknown as Date,
        isProrated: false,
      },
    });
    if (yaEmitida) return null;

    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company?.planId) return null;

    const plan = await this.plansRepository.findOne({
      where: { id: company.planId },
    });
    if (!plan) return null;

    const unidades = await this.unidadesDelPeriodo(
      companyId,
      periodStart,
      periodEnd,
    );
    const { facturables } = await this.addonsVigentes(companyId, periodEnd);

    const desglose = calcularPrecioMensual(
      {
        baseFee: Number(plan.baseFee),
        pricePerVehicle: Number(plan.pricePerVehicle),
      },
      unidades,
      facturables,
      (company.prepay as Prepago) ?? Prepago.MENSUAL,
    );

    const expiration = new Date(periodEnd);
    expiration.setDate(expiration.getDate() + DIAS_VENCIMIENTO);

    return this.subscriptionsRepository.save(
      this.subscriptionsRepository.create({
        companyId,
        periodStart: this.soloFecha(periodStart) as unknown as Date,
        periodEnd: this.soloFecha(periodEnd) as unknown as Date,
        expiration: this.soloFecha(expiration) as unknown as Date,
        baseAmount: desglose.baseAmount,
        vehiclesAmount: desglose.vehiclesAmount,
        addonsAmount: desglose.addonsAmount,
        discount: desglose.discount,
        amount: desglose.amount,
        status: SubscriptionStatus.ISSUED,
        isProrated: false,
        // Foto de lo facturado: sin esto una disputa es indefendible (R5.2).
        billedUnits: {
          ...unidades,
          billedTrucks: desglose.billedTrucks,
          billedUnits: desglose.billedUnits,
          planCode: plan.code,
          planName: plan.name,
          baseFee: Number(plan.baseFee),
          pricePerVehicle: Number(plan.pricePerVehicle),
          lineas: desglose.lineas,
        },
      }),
    );
  }

  // ──────────────────────── Cambios comerciales ──────────────────────────────

  /**
   * Cambio de plan, con la fricción asimétrica del §6.4:
   *
   *  - **Upgrade**: se aplica en el acto y se emite un cargo prorrateado por los
   *    días que faltan hasta el cierre del período.
   *  - **Downgrade**: NO se aplica ahora. Queda agendado para la próxima
   *    renovación, para que nadie suba y baje dentro del mismo período y
   *    distorsione la recaudación.
   */
  async cambiarPlan(
    companyId: string,
    nuevoPlanCode: string,
    usuarioId?: string,
  ): Promise<{ aplicado: boolean; prorrateo: Subscription | null; efectivoEl: Date }> {
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new BadRequestException('Empresa inexistente.');

    const nuevoPlan = await this.plansRepository.findOne({
      where: { code: nuevoPlanCode },
    });
    if (!nuevoPlan) throw new BadRequestException('Plan inexistente.');
    if (nuevoPlan.id === company.planId) {
      throw new BadRequestException('La empresa ya está en ese plan.');
    }

    const planActual = company.planId
      ? await this.plansRepository.findOne({ where: { id: company.planId } })
      : null;

    const precioActual = await this.precioConPlan(companyId, planActual);
    const precioNuevo = await this.precioConPlan(companyId, nuevoPlan);
    const esUpgrade = precioNuevo >= precioActual;

    const hoy = new Date();
    const { periodStart, periodEnd } = this.periodoDe(hoy, company.billingDay);

    if (!esUpgrade) {
      // Downgrade: se agenda, no se aplica.
      const efectivoEl = new Date(periodEnd);
      efectivoEl.setDate(efectivoEl.getDate() + 1);

      company.scheduledPlanId = nuevoPlan.id;
      company.scheduledEffectiveAt = efectivoEl;
      await this.companiesRepository.save(company);

      await this.updatesRepository.save(
        this.updatesRepository.create({
          companyId,
          changeType: PlanUpdateType.PLAN_DOWNGRADE,
          status: PlanUpdateStatus.PENDING,
          fromCode: planActual?.code,
          toCode: nuevoPlan.code,
          effectiveAt: efectivoEl,
          createdBy: usuarioId,
          notes: 'Downgrade agendado para la próxima renovación (§6.4).',
        }),
      );

      return { aplicado: false, prorrateo: null, efectivoEl };
    }

    // Upgrade: se aplica ya y se prorratea la diferencia.
    company.planId = nuevoPlan.id;
    company.scheduledPlanId = null;
    company.scheduledEffectiveAt = null;
    await this.companiesRepository.save(company);

    await this.updatesRepository.save(
      this.updatesRepository.create({
        companyId,
        changeType: PlanUpdateType.PLAN_UPGRADE,
        status: PlanUpdateStatus.APPLIED,
        fromCode: planActual?.code,
        toCode: nuevoPlan.code,
        effectiveAt: hoy,
        appliedAt: hoy,
        createdBy: usuarioId,
      }),
    );

    const prorrateo = await this.emitirProrrateo({
      companyId,
      precioAnterior: precioActual,
      precioNuevo,
      fechaCambio: hoy,
      periodStart,
      periodEnd,
      concepto: `Diferencia por cambio a plan ${nuevoPlan.name}`,
    });

    return { aplicado: true, prorrateo, efectivoEl: hoy };
  }

  /** Emite el cargo prorrateado de un cambio a mitad de período. */
  async emitirProrrateo(params: {
    companyId: string;
    precioAnterior: number;
    precioNuevo: number;
    fechaCambio: Date;
    periodStart: Date;
    periodEnd: Date;
    concepto: string;
  }): Promise<Subscription | null> {
    const MS_DIA = 24 * 60 * 60 * 1000;
    const diasDelPeriodo = Math.max(
      1,
      Math.round(
        (params.periodEnd.getTime() - params.periodStart.getTime()) / MS_DIA,
      ) + 1,
    );

    const { importe, diasRestantes } = calcularProrrateo({
      precioAnterior: params.precioAnterior,
      precioNuevo: params.precioNuevo,
      fechaCambio: params.fechaCambio,
      periodEnd: params.periodEnd,
      diasDelPeriodo,
    });

    // Un prorrateo negativo significa que se aplicó un downgrade en el acto, que
    // no debería pasar (§6.4). No se emite un crédito silencioso.
    if (importe <= 0) return null;

    const expiration = new Date(params.periodEnd);
    expiration.setDate(expiration.getDate() + DIAS_VENCIMIENTO);

    return this.subscriptionsRepository.save(
      this.subscriptionsRepository.create({
        companyId: params.companyId,
        periodStart: this.soloFecha(params.fechaCambio) as unknown as Date,
        periodEnd: this.soloFecha(params.periodEnd) as unknown as Date,
        expiration: this.soloFecha(expiration) as unknown as Date,
        baseAmount: 0,
        vehiclesAmount: 0,
        addonsAmount: 0,
        discount: 0,
        amount: importe,
        status: SubscriptionStatus.ISSUED,
        // Lo que evita que el cron de renovación lo tome como un período (R5.1).
        isProrated: true,
        notes: `${params.concepto} — ${diasRestantes} días`,
      }),
    );
  }

  /** Precio mensual de la empresa suponiendo un plan dado. */
  private async precioConPlan(
    companyId: string,
    plan: Plan | null,
  ): Promise<number> {
    if (!plan) return 0;
    const unidades = await this.contarUnidadesHoy(companyId);
    const { facturables } = await this.addonsVigentes(companyId);
    return calcularPrecioMensual(
      {
        baseFee: Number(plan.baseFee),
        pricePerVehicle: Number(plan.pricePerVehicle),
      },
      unidades,
      facturables,
    ).amount;
  }

  /**
   * Aplica los cambios diferidos cuyo `effectiveAt` ya llegó.
   *
   * Idempotente por `appliedAt`: si el cron corre dos veces, el segundo pase no
   * vuelve a aplicar nada.
   */
  async aplicarCambiosDiferidos(fecha = new Date()): Promise<number> {
    const pendientes = await this.updatesRepository.find({
      where: {
        status: PlanUpdateStatus.PENDING,
        effectiveAt: LessThanOrEqual(fecha),
        appliedAt: IsNull(),
      },
    });

    let aplicados = 0;

    for (const cambio of pendientes) {
      const company = await this.companiesRepository.findOne({
        where: { id: cambio.companyId },
      });
      if (!company) continue;

      if (
        cambio.changeType === PlanUpdateType.PLAN_DOWNGRADE &&
        company.scheduledPlanId
      ) {
        company.planId = company.scheduledPlanId;
        company.scheduledPlanId = null;
        company.scheduledEffectiveAt = null;
        await this.companiesRepository.save(company);

        // El plan nuevo puede tener topes más chicos que lo que la empresa ya
        // está usando (riesgo R4.3). Se desactiva el excedente por antigüedad y
        // se deja constancia de qué se apagó: nada se borra, y si vuelve a subir
        // de plan alcanza con reactivarlo.
        this.planContext.invalidar(company.id);
        const desactivado =
          await this.limitsService.ajustarExcedentePorDowngrade(company.id);

        const detalle = [
          ...desactivado.alertRules.map((r) => `regla "${r}"`),
          ...desactivado.maintenancePlans.map((p) => `plan "${p}"`),
        ];
        if (detalle.length) {
          cambio.notes =
            `${cambio.notes ?? ''} Desactivado por exceder el tope: ` +
            `${detalle.join(', ')}.`;
        }
      }

      if (cambio.changeType === PlanUpdateType.ADDON_REMOVED) {
        // La baja pedida se hace efectiva: `scheduledEndAt` pasa a `endedAt`.
        const aDarDeBaja = await this.companyAddonsRepository.find({
          where: {
            companyId: cambio.companyId,
            scheduledEndAt: LessThanOrEqual(fecha),
            endedAt: IsNull(),
          },
        });
        for (const ca of aDarDeBaja) {
          ca.endedAt = ca.scheduledEndAt;
          ca.scheduledEndAt = null;
          await this.companyAddonsRepository.save(ca);
        }
      }

      cambio.status = PlanUpdateStatus.APPLIED;
      cambio.appliedAt = fecha;
      await this.updatesRepository.save(cambio);
      aplicados++;
    }

    return aplicados;
  }

  // ──────────────────────────── Utilidades ───────────────────────────────────

  /** Período facturable que contiene a `fecha`, según el día de corte. */
  periodoDe(fecha: Date, billingDay = 1): { periodStart: Date; periodEnd: Date } {
    const dia = Math.min(Math.max(billingDay, 1), 28);

    const periodStart = new Date(fecha);
    periodStart.setHours(0, 0, 0, 0);
    if (periodStart.getDate() < dia) {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }
    periodStart.setDate(dia);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);

    return { periodStart, periodEnd };
  }

  /** `YYYY-MM-DD`, para columnas `date` sin arrastrar zona horaria. */
  private soloFecha(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  // ────────────────────────── Alta y baja de add-ons ─────────────────────────

  /** Catálogo disponible para el plan de una empresa. */
  async addonsDisponibles(companyId: string) {
    const contexto = await this.planContext.obtener(companyId);
    const planCode = contexto?.planCode;

    const addons: {
      id: string;
      code: string;
      name: string;
      description: string | null;
      monthlyPrice: string;
      pricePerVehicle: string;
      setupFee: string;
      availableFromPlans: string | null;
      isOneTime: number;
    }[] = await this.companiesRepository.query(
      'SELECT `id`,`code`,`name`,`description`,`monthlyPrice`,`pricePerVehicle`,' +
        '`setupFee`,`availableFromPlans`,`isOneTime` FROM `addons` ' +
        'WHERE `deletedAt` IS NULL AND `isPublic` = 1 ORDER BY `sortOrder`',
    );

    const contratados = await this.companyAddonsRepository.find({
      where: { companyId, endedAt: IsNull() },
    });
    const contratadosPorId = new Set(contratados.map((c) => c.addonId));

    return addons.map((a) => {
      const planes = a.availableFromPlans
        ? (JSON.parse(a.availableFromPlans) as string[])
        : [];
      return {
        ...a,
        monthlyPrice: Number(a.monthlyPrice),
        pricePerVehicle: Number(a.pricePerVehicle),
        setupFee: Number(a.setupFee),
        availableFromPlans: planes,
        isOneTime: !!a.isOneTime,
        contratado: contratadosPorId.has(a.id),
        // Lista vacía = disponible en todos los planes.
        disponible: planes.length === 0 || (!!planCode && planes.includes(planCode)),
      };
    });
  }

  /**
   * Contrata un add-on. Se aplica en el acto y se prorratea la diferencia,
   * igual que un upgrade de plan (§6.4).
   */
  async contratarAddon(
    companyId: string,
    code: string,
    quantity = 1,
    usuarioId?: string,
  ) {
    const disponibles = await this.addonsDisponibles(companyId);
    const addon = disponibles.find((a) => a.code === code);

    if (!addon) throw new BadRequestException('Add-on inexistente.');
    if (!addon.disponible) {
      throw new BadRequestException(
        `El add-on "${addon.name}" no está disponible para tu plan.`,
      );
    }
    if (addon.contratado) {
      throw new BadRequestException('El add-on ya está contratado.');
    }

    const precioAnterior = (await this.cotizar(companyId)).desglose.amount;

    const hoy = new Date();
    await this.companyAddonsRepository.save(
      this.companyAddonsRepository.create({
        companyId,
        addonId: addon.id,
        quantity,
        startedAt: this.soloFecha(hoy) as unknown as Date,
        createdBy: usuarioId,
      }),
    );

    // El add-on puede aportar features: hay que releer el plan efectivo.
    this.planContext.invalidar(companyId);

    await this.updatesRepository.save(
      this.updatesRepository.create({
        companyId,
        changeType: PlanUpdateType.ADDON_ADDED,
        status: PlanUpdateStatus.APPLIED,
        toCode: addon.code,
        effectiveAt: hoy,
        appliedAt: hoy,
        createdBy: usuarioId,
      }),
    );

    const precioNuevo = (await this.cotizar(companyId)).desglose.amount;
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    const { periodStart, periodEnd } = this.periodoDe(
      hoy,
      company?.billingDay ?? 1,
    );

    const prorrateo = await this.emitirProrrateo({
      companyId,
      precioAnterior,
      precioNuevo,
      fechaCambio: hoy,
      periodStart,
      periodEnd,
      concepto: `Alta de ${addon.name}`,
    });

    return { addon: addon.code, prorrateo };
  }

  /**
   * Da de baja un add-on **a partir de la próxima renovación** (§6.4).
   *
   * No se corta en el acto para que nadie contrate y cancele dentro del mismo
   * período; y como ya se cobró el mes, seguir usándolo hasta el cierre es lo
   * que corresponde.
   */
  async darDeBajaAddon(companyId: string, code: string, usuarioId?: string) {
    const contratados = await this.companyAddonsRepository.find({
      where: { companyId, endedAt: IsNull() },
      relations: ['addon'],
    });
    const contratado = contratados.find((c) => c.addon?.code === code);
    if (!contratado) {
      throw new BadRequestException('El add-on no está contratado.');
    }

    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    const { periodEnd } = this.periodoDe(new Date(), company?.billingDay ?? 1);
    const efectivoEl = new Date(periodEnd);
    efectivoEl.setDate(efectivoEl.getDate() + 1);

    contratado.scheduledEndAt = this.soloFecha(efectivoEl) as unknown as Date;
    if (usuarioId) contratado.updatedBy = usuarioId;
    await this.companyAddonsRepository.save(contratado);

    await this.updatesRepository.save(
      this.updatesRepository.create({
        companyId,
        changeType: PlanUpdateType.ADDON_REMOVED,
        status: PlanUpdateStatus.PENDING,
        fromCode: code,
        effectiveAt: efectivoEl,
        createdBy: usuarioId,
        notes: 'Baja agendada para la próxima renovación (§6.4).',
      }),
    );

    return { addon: code, efectivoEl };
  }

  /** Períodos facturados de una empresa, del más reciente al más viejo. */
  listarPeriodos(companyId: string): Promise<Subscription[]> {
    return this.subscriptionsRepository.find({
      where: { companyId },
      order: { periodStart: 'DESC' },
    });
  }

  /** Marca un período como cobrado. */
  async marcarPagada(subscriptionId: string, fecha = new Date()) {
    const sub = await this.subscriptionsRepository.findOne({
      where: { id: subscriptionId },
    });
    if (!sub) throw new BadRequestException('Período inexistente.');

    sub.isPaid = true;
    sub.paidAt = this.soloFecha(fecha) as unknown as Date;
    sub.status = SubscriptionStatus.PAID;
    return this.subscriptionsRepository.save(sub);
  }

  /** Períodos vencidos sin pagar: los marca y devuelve cuántos. */
  async marcarVencidas(fecha = new Date()): Promise<number> {
    const r = await this.subscriptionsRepository.update(
      {
        isPaid: false,
        status: In([SubscriptionStatus.ISSUED]),
        expiration: LessThanOrEqual(this.soloFecha(fecha) as unknown as Date),
      },
      { status: SubscriptionStatus.OVERDUE },
    );
    return r.affected ?? 0;
  }
}
