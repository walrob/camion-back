import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

const DEFAULT_THRESHOLDS: Record<string, string> = {
  idleHoursThreshold: '6',
  expenseAmountThreshold: '100000',
  expiryWarningDays: '30',
};

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
    const threshold = await this.getThreshold('expenseAmountThreshold');
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

  // ───────── Cron: camión detenido ─────────
  @Cron(CronExpression.EVERY_30_MINUTES)
  async detectIdleTrucks(): Promise<void> {
    const idleHours = await this.getThreshold('idleHoursThreshold');
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
  list(filters: { level?: AlertLevel; status?: AlertStatus }): Promise<Alert[]> {
    return this.alertsRepository.find({
      where: {
        ...(filters.level && { level: filters.level }),
        ...(filters.status && { status: filters.status }),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  countActive(): Promise<number> {
    return this.alertsRepository.count({
      where: { status: Not(AlertStatus.RESOLVED) },
    });
  }

  async setStatus(
    id: string,
    status: AlertStatus,
    user: ActiveUserInterface,
  ): Promise<Alert> {
    const alert = await this.alertsRepository.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alerta no encontrada.');
    alert.status = status;
    alert.updatedBy = user.id;
    const saved = await this.alertsRepository.save(alert);
    this.gateway.emitUpdate(saved);
    return saved;
  }

  // ───────── Umbrales ─────────
  async getThreshold(key: string): Promise<number> {
    const config = await this.configRepository.findOne({ where: { key } });
    const value = config?.value ?? DEFAULT_THRESHOLDS[key] ?? '0';
    return Number(value);
  }

  async getAllThresholds() {
    const configs = await this.configRepository.find();
    const map: Record<string, { value: string; enabled: boolean }> = {};
    for (const [key, value] of Object.entries(DEFAULT_THRESHOLDS)) {
      const found = configs.find((c) => c.key === key);
      map[key] = {
        value: found?.value ?? value,
        enabled: found?.enabled ?? true,
      };
    }
    return map;
  }

  async setThreshold(key: string, value: string, enabled = true) {
    let config = await this.configRepository.findOne({ where: { key } });
    if (!config) config = this.configRepository.create({ key });
    config.value = value;
    config.enabled = enabled;
    return this.configRepository.save(config);
  }
}
