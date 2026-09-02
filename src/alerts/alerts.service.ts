import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Alert } from './entities/alert.entity';
import { AlertRuleConfig } from './entities/alert-rule-config.entity';
import {
  AlertLevel,
  AlertSourceType,
  AlertStatus,
} from 'src/common/enums/alert.enum';
import { IncidentSeverity } from 'src/common/enums/incident.enum';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { AlertsGateway } from './alerts.gateway';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { LimitsService } from 'src/plans/limits.service';
import { getCurrentCompanyId } from 'src/common/tenant/tenant-context';
import { TenantCronRunner } from 'src/common/tenant/tenant-cron.runner';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';
import { PlanContextService } from 'src/plans/plan-context.service';
import { Feature } from 'src/common/enums/feature.enum';
import {
  ALERT_RULE,
  ALERT_RULES,
  ALERT_RULE_BY_KEY,
  AlertRuleDef,
} from './alerts.catalog';
import {
  assertNoCerrado,
  assertPuedeReabrir,
  exigirMotivo,
} from 'src/common/utils/registro-cerrado.util';

const OPS_ROLES = ['admin', 'manager', 'dispatcher'];

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertsRepository: Repository<Alert>,
    @InjectRepository(AlertRuleConfig)
    private readonly configRepository: Repository<AlertRuleConfig>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    @InjectRepository(TripLogEntry)
    private readonly entriesRepository: Repository<TripLogEntry>,
    private readonly gateway: AlertsGateway,
    private readonly limitsService: LimitsService,
    private readonly cronRunner: TenantCronRunner,
    private readonly auditLog: AuditLogService,
    private readonly planContext: PlanContextService,
  ) {}

  // ───────── Núcleo ─────────
  async createAlert(params: {
    level: AlertLevel;
    sourceType: AlertSourceType;
    sourceId?: string;
    title: string;
    message: string;
    targetRoles?: string[];
  }): Promise<Alert> {
    const alert = await this.alertsRepository.save(
      this.alertsRepository.create({
        ...params,
        targetRoles: params.targetRoles ?? OPS_ROLES,
      }),
    );
    this.gateway.emitNew(alert);
    if (alert.level === AlertLevel.RED || alert.level === AlertLevel.ORANGE) {
      this.notifyUrgent(alert);
    }
    return alert;
  }

  /** Crea la alerta solo si no hay una sin resolver para el mismo origen. */
  async createDedup(params: {
    level: AlertLevel;
    sourceType: AlertSourceType;
    sourceId: string;
    title: string;
    message: string;
    targetRoles?: string[];
  }): Promise<Alert | null> {
    const existing = await this.alertsRepository.findOne({
      where: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        status: Not(AlertStatus.RESOLVED),
      },
    });
    if (existing) return null;
    return this.createAlert(params);
  }

  private notifyUrgent(alert: Alert) {
    // TODO (Fase 10): enviar push FCM / email a los roles destino.
    this.logger.warn(`🔔 Alerta ${alert.level.toUpperCase()}: ${alert.title}`);
  }

  // ───────── Disparadores (llamados por otros módulos) ─────────
  async createFromIncident(incident: {
    id: string;
    code: string;
    severity: string;
    type: string;
  }) {
    const level =
      incident.severity === IncidentSeverity.CRITICAL
        ? AlertLevel.RED
        : incident.severity === IncidentSeverity.HIGH
          ? AlertLevel.ORANGE
          : AlertLevel.YELLOW;

    return this.createAlert({
      level,
      sourceType: AlertSourceType.INCIDENT,
      sourceId: incident.id,
      title: `Incidente ${incident.code}`,
      message: `Nuevo incidente (${incident.type}) con severidad ${incident.severity}.`,
    });
  }

  async createFromExpense(entry: { id: string; amount: number; type: string }) {
    if (!(await this.reglaActiva(ALERT_RULE.EXPENSE))) return null;
    const threshold = await this.getThreshold(ALERT_RULE.EXPENSE);
    if (Number(entry.amount) <= threshold) return null;
    return this.createAlert({
      level: AlertLevel.YELLOW,
      sourceType: AlertSourceType.EXPENSE,
      sourceId: entry.id,
      title: 'Gasto fuera de umbral',
      message: `Se registró un gasto de $${entry.amount} (${entry.type}), supera el umbral de $${threshold}.`,
    });
  }

  async createFromCertification(cert: {
    id: string;
    type: string;
    expiryDate?: string;
    expired?: boolean;
  }) {
    return this.createAlert({
      level: cert.expired ? AlertLevel.YELLOW : AlertLevel.GREEN,
      sourceType: AlertSourceType.CERTIFICATION,
      sourceId: cert.id,
      title: cert.expired ? 'Documentación vencida' : 'Documentación por vencer',
      message: `El permiso/certificación (${cert.type}) ${cert.expired ? 'está vencido' : `vence el ${cert.expiryDate}`}.`,
      targetRoles: ['admin', 'hr', 'manager'],
    });
  }

  /**
   * Se asignó un viaje a un chofer con una licencia de por medio. Si hubo que
   * finalizarla para poder asignarlo, la alerta sube de nivel: RRHH tiene que
   * enterarse de que operaciones le tocó el legajo.
   */
  async createFromLeaveAssignment(params: {
    employeeId: string;
    employeeName: string;
    leaveUntil?: string | null;
    tripStart: string;
    closed: boolean;
  }) {
    const until = params.leaveUntil
      ? `hasta el ${params.leaveUntil}`
      : 'sin fecha de fin';

    return this.createAlert({
      level: params.closed ? AlertLevel.ORANGE : AlertLevel.YELLOW,
      sourceType: AlertSourceType.EMPLOYMENT,
      sourceId: params.employeeId,
      title: params.closed
        ? 'Licencia finalizada para asignar un viaje'
        : 'Viaje asignado a un chofer de licencia',
      message: params.closed
        ? `Se finalizó la licencia de ${params.employeeName} (${until}) para asignarle un viaje que arranca el ${params.tripStart}.`
        : `${params.employeeName} está de licencia ${until} y se le asignó un viaje que arranca el ${params.tripStart}.`,
      targetRoles: ['admin', 'hr', 'manager', 'dispatcher'],
    });
  }

  // ───────── Cron: camión detenido ─────────

  /**
   * Corre sin request, así que no hay contexto de empresa: se hace una pasada
   * por empresa. Sin eso, las consultas verían los camiones de todas juntas y el
   * `TenantSubscriber` rechazaría la alerta por no saber de quién es.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  detectIdleTrucks(): Promise<void> {
    return this.cronRunner.porEmpresa('Camiones detenidos', () =>
      this.detectIdleTrucksOfCompany(),
    );
  }

  /** Una empresa, con su contexto ya abierto. */
  private async detectIdleTrucksOfCompany(): Promise<void> {
    if (!(await this.reglaActiva(ALERT_RULE.TRUCK_IDLE))) return;
    const idleHours = await this.getThreshold(ALERT_RULE.TRUCK_IDLE);
    const cutoff = new Date(Date.now() - idleHours * 60 * 60 * 1000);

    const trucks = await this.trucksRepository.find({
      where: { status: TruckStatus.ON_TRIP },
    });

    for (const truck of trucks) {
      const trip = await this.tripsRepository.findOne({
        where: { truckId: truck.id, status: TripStatus.IN_PROGRESS },
        order: { startedAt: 'DESC' },
      });
      if (!trip || !trip.startedAt || trip.startedAt > cutoff) continue;

      const recent = await this.entriesRepository.findOne({
        where: { tripId: trip.id, occurredAt: MoreThanOrEqual(cutoff) },
      });
      if (recent) continue;

      // Evitar duplicar: ya existe alerta de idle no resuelta para este camión.
      const existing = await this.alertsRepository.findOne({
        where: {
          sourceType: AlertSourceType.TRUCK_IDLE,
          sourceId: truck.id,
          status: Not(AlertStatus.RESOLVED),
        },
      });
      if (existing) continue;

      await this.createAlert({
        level: AlertLevel.ORANGE,
        sourceType: AlertSourceType.TRUCK_IDLE,
        sourceId: truck.id,
        title: `Camión detenido: ${truck.plate}`,
        message: `El camión ${truck.plate} no registra movimiento ni gastos hace más de ${idleHours} horas.`,
      });
    }
  }

  // ───────── Consulta y estado ─────────
  list(filters: {
    level?: AlertLevel;
    status?: AlertStatus;
    from?: string;
    to?: string;
  }): Promise<Alert[]> {
    const qb = this.alertsRepository.createQueryBuilder('a');
    if (filters.level) qb.andWhere('a.level = :level', { level: filters.level });
    if (filters.status)
      qb.andWhere('a.status = :status', { status: filters.status });
    if (filters.from) qb.andWhere('a.createdAt >= :from', { from: filters.from });
    if (filters.to)
      qb.andWhere('a.createdAt < :to', { to: this.addOneDay(filters.to) });
    return qb.orderBy('a.createdAt', 'DESC').take(200).getMany();
  }

  /**
   * Suma un día a una fecha 'YYYY-MM-DD' para que el filtro `to` incluya todo
   * ese día: createdAt < (to + 1 día) cubre desde 00:00 hasta 23:59:59 de `to`.
   */
  private addOneDay(date: string): Date {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d;
  }

  countActive(): Promise<number> {
    return this.alertsRepository.count({
      where: { status: Not(AlertStatus.RESOLVED) },
    });
  }

  /**
   * Avanza el estado de gestión de la alerta (vista → reconocida → resuelta).
   *
   * No puede retroceder desde resuelta: el front esconde los botones, pero eso
   * no es un control — la API los aceptaba igual y una alerta podía volver a
   * "nueva" sin que quedara rastro de quién la desenterró. Para volver atrás
   * está `reopen`, que pide motivo.
   */
  async setStatus(
    id: string,
    status: AlertStatus,
    user: ActiveUserInterface,
  ): Promise<Alert> {
    const alert = await this.findOneOrFail(id);
    assertNoCerrado(
      alert.status === AlertStatus.RESOLVED,
      'La alerta ya está resuelta. Si el problema sigue, reabrila indicando el motivo.',
    );
    alert.status = status;
    alert.updatedBy = user.id;
    const saved = await this.alertsRepository.save(alert);
    this.gateway.emitUpdate(saved);
    return saved;
  }

  /**
   * Vuelve a poner en gestión una alerta resuelta.
   *
   * Queda en `acknowledged` y no en `new`: alguien ya la vio y la trabajó, y
   * fingir que es nueva ensucia el conteo de pendientes sin agregar nada.
   */
  async reopen(
    id: string,
    reason: string,
    user: ActiveUserInterface,
  ): Promise<Alert> {
    const alert = await this.findOneOrFail(id);
    assertPuedeReabrir(user);
    if (alert.status !== AlertStatus.RESOLVED) {
      throw new BadRequestException('La alerta no está resuelta.');
    }
    const motivo = exigirMotivo(reason, 'la alerta');

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.updatedBy = user.id;
    const saved = await this.alertsRepository.save(alert);

    await this.auditLog.registrar(user, {
      action: AUDIT.ALERT_REOPENED,
      companyId: user.companyId,
      entityType: 'alert',
      entityId: id,
      metadata: { titulo: saved.title, nivel: saved.level, motivo },
    });

    this.gateway.emitUpdate(saved);
    return saved;
  }

  private async findOneOrFail(id: string): Promise<Alert> {
    const alert = await this.alertsRepository.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alerta no encontrada.');
    return alert;
  }

  // ───────── Reglas del motor ─────────

  /**
   * Umbral efectivo de una regla: el de la empresa, o el del catálogo.
   *
   * Lo consultan el propio motor, mantenimiento, documentos y permisos. Devuelve
   * el default aunque la regla esté apagada: quien decide si emitir o no es
   * `reglaActiva`, y así un umbral no queda en cero por accidente.
   */
  async getThreshold(key: string): Promise<number> {
    const def = ALERT_RULE_BY_KEY.get(key);
    const config = await this.configRepository.findOne({ where: { key } });
    return Number(config?.value ?? def?.threshold?.default ?? '0');
  }

  /**
   * ¿La empresa quiere esta alerta? Por defecto **sí**: una empresa que nunca
   * entró a configurar recibe exactamente las mismas alertas que antes.
   */
  async reglaActiva(key: string): Promise<boolean> {
    if (ALERT_RULE_BY_KEY.get(key)?.siempreActiva) return true;
    const config = await this.configRepository.findOne({ where: { key } });
    return config?.enabled ?? true;
  }

  /** Las reglas con su estado efectivo: es lo que dibuja la pantalla. */
  async reglas() {
    const configs = await this.configRepository.find();
    return ALERT_RULES.map((def) => {
      const propia = configs.find((c) => c.key === def.key);
      return {
        ...def,
        enabled: def.siempreActiva ? true : (propia?.enabled ?? true),
        value: propia?.value ?? def.threshold?.default ?? null,
        /** `true` si la empresa la tocó: es lo que consume cupo del plan. */
        personalizada: !!propia,
      };
    });
  }

  /**
   * Guarda la configuración de las reglas.
   *
   * Dos permisos distintos, a propósito (MODELO-COMERCIAL §4.1):
   *
   * - **Apagar o prender** una regla entra con la configuración (Operación).
   * - **Cambiar un umbral** es «Umbrales de alerta personalizables», de Gestión.
   *
   * Y el cupo del plan —3 reglas en Control, 10 en Operación— se cuenta sobre
   * las reglas que la empresa **configuró**, que es lo que existe como fila.
   */
  async guardarReglas(
    reglas: { key: string; enabled?: boolean; value?: string }[],
    user: ActiveUserInterface,
  ) {
    const companyId = getCurrentCompanyId();
    const puedeUmbrales = companyId
      ? await this.tieneFeatureUmbrales(companyId)
      : true;

    const configs = await this.configRepository.find();
    const cambios: Record<string, { de: string; a: string }> = {};

    for (const entrada of reglas) {
      const def = ALERT_RULE_BY_KEY.get(entrada.key);
      if (!def) throw new BadRequestException(`Regla desconocida: ${entrada.key}`);

      const previa = configs.find((c) => c.key === entrada.key);
      const enabled = def.siempreActiva ? true : (entrada.enabled ?? true);
      const valorPrevio = previa?.value ?? def.threshold?.default ?? '';
      const valor = this.normalizarUmbral(def, entrada.value, valorPrevio);

      if (def.siempreActiva && !(entrada.enabled ?? true)) {
        throw new BadRequestException(
          `«${def.label}» no se puede desactivar: es parte del funcionamiento del sistema.`,
        );
      }
      if (valor !== valorPrevio && !puedeUmbrales) {
        throw new ForbiddenException(
          'Cambiar los umbrales de alerta viene con el plan Gestión. ' +
            'Con tu plan podés prender y apagar reglas.',
        );
      }

      const sinCambios =
        !!previa && previa.enabled === enabled && previa.value === valor;
      const nadaQueGuardar =
        !previa && enabled && valor === (def.threshold?.default ?? '');
      if (sinCambios || nadaQueGuardar) continue;

      // El cupo se consume al crear la primera configuración propia de una
      // regla: es lo que el plan llama «reglas de alerta activas».
      if (!previa && companyId) {
        await this.limitsService.assertCanCreate(companyId, 'alertRules');
      }

      const fila = previa ?? this.configRepository.create({ key: entrada.key });
      fila.enabled = enabled;
      fila.value = valor;
      await this.configRepository.save(fila);

      cambios[entrada.key] = {
        de: `${valorPrevio}${previa?.enabled === false ? ' (apagada)' : ''}`,
        a: `${valor}${enabled ? '' : ' (apagada)'}`,
      };
    }

    if (Object.keys(cambios).length) {
      await this.auditLog.registrar(user, {
        action: AUDIT.ALERT_RULES_UPDATED,
        companyId: user.companyId,
        entityType: 'alert_rule_config',
        entityId: null,
        metadata: { cambios },
      });
    }

    return this.reglas();
  }

  private async tieneFeatureUmbrales(companyId: string): Promise<boolean> {
    const contexto = await this.planContext.obtener(companyId);
    return !!contexto?.features?.includes(Feature.ALERT_THRESHOLDS);
  }

  /** El umbral tiene que ser un número dentro del rango que declara la regla. */
  private normalizarUmbral(
    def: AlertRuleDef,
    valor: string | undefined,
    previo: string,
  ): string {
    if (!def.threshold) return '';
    if (valor == null || valor === '') return previo;

    const n = Number(valor);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`«${def.label}»: el umbral tiene que ser un número.`);
    }
    if (n < def.threshold.min || n > def.threshold.max) {
      throw new BadRequestException(
        `«${def.label}»: el valor tiene que estar entre ${def.threshold.min} y ` +
          `${def.threshold.max} ${def.threshold.unit}.`,
      );
    }
    return String(n);
  }
}
