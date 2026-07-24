import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MaintenancePlan } from './entities/maintenance-plan.entity';
import { MaintenanceOrder } from './entities/maintenance-order.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  MaintenanceOrderStatus,
  MaintenancePlanStatus,
  MaintenanceTriggerType,
} from 'src/common/enums/maintenance.enum';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { AlertLevel, AlertSourceType } from 'src/common/enums/alert.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { TrucksService } from 'src/fleet/trucks.service';
import { AlertsService } from 'src/alerts/alerts.service';
import { Truck } from 'src/fleet/entities/truck.entity';
import {
  PdfReport,
  dateOnly,
  money,
  number as num,
} from 'src/common/pdf/pdf-report.util';

const ORDER_STATUS_LABELS: Record<string, string> = {
  [MaintenanceOrderStatus.OPEN]: 'Abierta',
  [MaintenanceOrderStatus.IN_PROGRESS]: 'En proceso',
  [MaintenanceOrderStatus.DONE]: 'Finalizada',
};

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenancePlan)
    private readonly plansRepository: Repository<MaintenancePlan>,
    @InjectRepository(MaintenanceOrder)
    private readonly ordersRepository: Repository<MaintenanceOrder>,
    private readonly trucksService: TrucksService,
    private readonly alertsService: AlertsService,
  ) {}

  // ───────── Planes ─────────
  async createPlan(
    dto: CreatePlanDto,
    user: ActiveUserInterface,
  ): Promise<MaintenancePlan> {
    const truck = await this.trucksService.findOne(dto.truckId);
    const plan = this.plansRepository.create({ ...dto, createdBy: user.id });
    this.applyNextDue(plan, truck);
    return this.plansRepository.save(plan);
  }

  plansByTruck(truckId: string): Promise<MaintenancePlan[]> {
    return this.plansRepository.find({
      where: { truckId },
      order: { name: 'ASC' },
    });
  }

  allPlans(): Promise<MaintenancePlan[]> {
    return this.plansRepository.find({
      relations: ['truck'],
      order: { nextDueAt: 'ASC' },
    });
  }

  async findPlan(id: string): Promise<MaintenancePlan> {
    const plan = await this.plansRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan de mantenimiento no encontrado.');
    return plan;
  }

  async updatePlan(
    id: string,
    dto: UpdatePlanDto,
    user: ActiveUserInterface,
  ): Promise<MaintenancePlan> {
    const plan = await this.findPlan(id);
    Object.assign(plan, dto, { updatedBy: user.id });
    const truck = await this.trucksService.findOne(plan.truckId);
    this.applyNextDue(plan, truck);
    return this.plansRepository.save(plan);
  }

  async removePlan(id: string, user: ActiveUserInterface) {
    const plan = await this.findPlan(id);
    plan.deletedBy = user.id;
    await this.plansRepository.save(plan);
    return this.plansRepository.softDelete(id);
  }

  // ───────── Órdenes de trabajo ─────────
  async createOrder(
    dto: CreateOrderDto,
    user: ActiveUserInterface,
  ): Promise<MaintenanceOrder> {
    const order = this.ordersRepository.create({ ...dto, createdBy: user.id });
    const saved = await this.ordersRepository.save(order);
    await this.syncTruckStatus(saved, user);
    if (saved.status === MaintenanceOrderStatus.DONE) {
      await this.applyOrderToPlan(saved, user);
    }
    return saved;
  }

  ordersByTruck(truckId: string): Promise<MaintenanceOrder[]> {
    return this.ordersRepository.find({
      where: { truckId },
      order: { date: 'DESC' },
    });
  }

  async findOrder(id: string): Promise<MaintenanceOrder> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Orden de trabajo no encontrada.');
    return order;
  }

  /** Orden de trabajo imprimible (comprobante para el taller). */
  async buildOrderPdf(id: string): Promise<Buffer> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['truck'],
    });
    if (!order) throw new NotFoundException('Orden de trabajo no encontrada.');

    const truck = order.truck;
    const items = order.items ?? [];
    const done = order.status === MaintenanceOrderStatus.DONE;

    const report = new PdfReport({
      title: 'Orden de trabajo',
      docId: order.id.slice(0, 8).toUpperCase(),
      subtitle: truck ? `Unidad ${truck.plate}` : undefined,
      badge: {
        text: ORDER_STATUS_LABELS[order.status] ?? order.status,
        tone: done ? 'ok' : order.status === MaintenanceOrderStatus.IN_PROGRESS ? 'warn' : 'neutral',
      },
      dataDateLabel: 'Fecha',
      dataDate: order.date ?? null,
    });

    report.section('Datos de la orden', 0).fields([
      { label: 'Fecha', value: dateOnly(order.date) },
      { label: 'Estado', value: ORDER_STATUS_LABELS[order.status] ?? order.status },
      {
        label: 'Odómetro',
        value: order.odometerKm != null ? `${num(order.odometerKm)} km` : '-',
      },
      { label: 'Camión', value: truck?.plate },
      {
        label: 'Marca / Modelo',
        value: truck ? [truck.brand, truck.model, truck.year].filter(Boolean).join(' ') : '-',
      },
      { label: 'N° interno', value: truck?.internalNumber },
    ]);

    if (order.description) {
      report.section('Trabajo a realizar').paragraph(order.description);
    }

    report.section('Repuestos / tareas').table({
      columns: [
        { label: 'Detalle', width: 60 },
        { label: 'Costo', width: 22, align: 'right' },
      ],
      rows: items.map((it) => [it.name, it.cost != null ? money(it.cost) : '']),
      totalRow: ['Total', money(order.cost)],
      emptyText: 'Sin repuestos ni tareas detalladas.',
    });

    if (order.notes) {
      report.section('Observaciones').paragraph(order.notes, { muted: true });
    }

    report.signatures(['Responsable del taller', 'Conformidad']);
    return report.finish();
  }

  async updateOrder(
    id: string,
    dto: UpdateOrderDto,
    user: ActiveUserInterface,
  ): Promise<MaintenanceOrder> {
    const order = await this.findOrder(id);
    const wasDone = order.status === MaintenanceOrderStatus.DONE;
    Object.assign(order, dto, { updatedBy: user.id });
    const saved = await this.ordersRepository.save(order);
    await this.syncTruckStatus(saved, user);
    if (!wasDone && saved.status === MaintenanceOrderStatus.DONE) {
      await this.applyOrderToPlan(saved, user);
    }
    return saved;
  }

  /** Próximos vencimientos de mantenimiento (km o fecha cercanos). */
  async upcoming() {
    const plans = await this.allPlans();
    const result: any[] = [];
    for (const plan of plans) {
      if (plan.status !== MaintenancePlanStatus.ACTIVE) continue;
      const truck = plan.truck;
      const due = this.dueInfo(plan, truck);
      if (due.soon) result.push({ plan, ...due });
    }
    return result;
  }

  // ───────── Cron de avisos ─────────
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async evaluatePlans(): Promise<void> {
    const kmThreshold = await this.alertsService.getThreshold('maintenanceKmThreshold');
    const daysThreshold = await this.alertsService.getThreshold('maintenanceDaysThreshold');

    const plans = await this.allPlans();
    for (const plan of plans) {
      if (plan.status !== MaintenancePlanStatus.ACTIVE) continue;
      const due = this.dueInfo(plan, plan.truck, kmThreshold, daysThreshold);
      if (!due.soon) continue;

      await this.alertsService.createDedup({
        level: AlertLevel.GREEN,
        sourceType: AlertSourceType.MAINTENANCE,
        sourceId: plan.id,
        title: `Service próximo: ${plan.truck?.plate ?? ''}`,
        message: `El plan "${plan.name}" del camión ${plan.truck?.plate ?? ''} ${due.reason}.`,
        targetRoles: ['admin', 'maintenance', 'manager'],
      });
    }
  }

  // ───────── Helpers ─────────
  private applyNextDue(plan: MaintenancePlan, truck: Truck) {
    if (plan.triggerType === MaintenanceTriggerType.DATE) {
      const base = plan.lastServiceAt ? new Date(plan.lastServiceAt) : new Date();
      base.setDate(base.getDate() + plan.intervalValue);
      plan.nextDueAt = base.toISOString().slice(0, 10);
    } else if (plan.triggerType === MaintenanceTriggerType.HOURS) {
      const base = plan.lastServiceKm ?? truck.engineHours ?? 0;
      plan.nextDueKm = base + plan.intervalValue;
    } else {
      const base = plan.lastServiceKm ?? truck.currentOdometerKm ?? 0;
      plan.nextDueKm = base + plan.intervalValue;
    }
  }

  private dueInfo(
    plan: MaintenancePlan,
    truck?: Truck,
    kmThreshold = 1000,
    daysThreshold = 15,
  ): { soon: boolean; reason: string; remaining?: number } {
    if (plan.triggerType === MaintenanceTriggerType.DATE) {
      if (!plan.nextDueAt) return { soon: false, reason: '' };
      const days = Math.ceil(
        (new Date(plan.nextDueAt).getTime() - Date.now()) / 86400000,
      );
      return {
        soon: days <= daysThreshold,
        remaining: days,
        reason: days < 0 ? `venció hace ${-days} días` : `vence en ${days} días`,
      };
    }
    const current =
      plan.triggerType === MaintenanceTriggerType.HOURS
        ? (truck?.engineHours ?? 0)
        : (truck?.currentOdometerKm ?? 0);
    if (plan.nextDueKm == null) return { soon: false, reason: '' };
    const remaining = plan.nextDueKm - current;
    const unit = plan.triggerType === MaintenanceTriggerType.HOURS ? 'h' : 'km';
    return {
      soon: remaining <= kmThreshold,
      remaining,
      reason: remaining < 0 ? `pasó por ${-remaining} ${unit}` : `faltan ${remaining} ${unit}`,
    };
  }

  private async applyOrderToPlan(
    order: MaintenanceOrder,
    user: ActiveUserInterface,
  ) {
    if (!order.planId) return;
    const plan = await this.findPlan(order.planId);
    const truck = await this.trucksService.findOne(plan.truckId);
    if (plan.triggerType === MaintenanceTriggerType.DATE) {
      plan.lastServiceAt = order.date;
    } else {
      plan.lastServiceKm =
        order.odometerKm ??
        (plan.triggerType === MaintenanceTriggerType.HOURS
          ? truck.engineHours
          : truck.currentOdometerKm);
    }
    plan.updatedBy = user.id;
    this.applyNextDue(plan, truck);
    await this.plansRepository.save(plan);
  }

  private async syncTruckStatus(
    order: MaintenanceOrder,
    user: ActiveUserInterface,
  ) {
    if (
      order.status === MaintenanceOrderStatus.OPEN ||
      order.status === MaintenanceOrderStatus.IN_PROGRESS
    ) {
      await this.trucksService.update(
        order.truckId,
        { status: TruckStatus.WORKSHOP },
        user,
      );
    } else if (order.status === MaintenanceOrderStatus.DONE) {
      await this.trucksService.update(
        order.truckId,
        { status: TruckStatus.AVAILABLE },
        user,
      );
    }
  }
}
