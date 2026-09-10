import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { MaintenancePlan } from './entities/maintenance-plan.entity';
import { MaintenanceOrder } from './entities/maintenance-order.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { MaintenanceService } from './maintenance.service';
import {
  MaintenanceOrderStatus,
  MaintenancePlanStatus,
  MaintenanceTriggerType,
} from 'src/common/enums/maintenance.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import {
  assertExportSize,
  buildImportTemplate,
  buildXlsx,
  cell,
  dateCell,
  ExcelRow,
  ImportColumn,
  ImportResult,
  runExcelImport,
} from 'src/common/excel';

/** Idénticas a las del front (`useMaintenanceStatus.ts`). */
const TRIGGER_LABELS: Record<MaintenanceTriggerType, string> = {
  [MaintenanceTriggerType.KM]: 'Kilómetros',
  [MaintenanceTriggerType.HOURS]: 'Horas de uso',
  [MaintenanceTriggerType.DATE]: 'Fecha',
};

const PLAN_STATUS_LABELS: Record<MaintenancePlanStatus, string> = {
  [MaintenancePlanStatus.ACTIVE]: 'Activo',
  [MaintenancePlanStatus.PAUSED]: 'Pausado',
};

const ORDER_STATUS_LABELS: Record<MaintenanceOrderStatus, string> = {
  [MaintenanceOrderStatus.OPEN]: 'Abierta',
  [MaintenanceOrderStatus.IN_PROGRESS]: 'En proceso',
  [MaintenanceOrderStatus.DONE]: 'Finalizada',
};

interface PlanCtx {
  camiones: Map<string, string>;
}

@Injectable()
export class MaintenanceExcelService {
  constructor(
    @InjectRepository(MaintenancePlan)
    private readonly plansRepository: Repository<MaintenancePlan>,
    @InjectRepository(MaintenanceOrder)
    private readonly ordersRepository: Repository<MaintenanceOrder>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  // ───────────────────── Planes preventivos ─────────────────────

  private planColumns(): ImportColumn<PlanCtx>[] {
    return [
      {
        header: 'Patente',
        field: 'truckId',
        aliases: ['Camion', 'Camión'],
        required: true,
        parse: cell.lookup<PlanCtx>((c) => c.camiones, 'el camión'),
        hint: 'Patente de un camión ya cargado.',
        example: 'AB123CD',
      },
      {
        header: 'Plan',
        field: 'name',
        aliases: ['Nombre'],
        required: true,
        parse: cell.text(120),
        hint: 'Junto con la patente identifica la fila: si ya existe, se actualiza.',
        example: 'Cambio de aceite',
      },
      {
        header: 'Disparador',
        field: 'triggerType',
        required: true,
        parse: cell.enumLabel<MaintenanceTriggerType>(TRIGGER_LABELS),
        hint: `Uno de: ${Object.values(TRIGGER_LABELS).join(', ')}.`,
        example: 'Kilómetros',
      },
      {
        header: 'Intervalo',
        field: 'intervalValue',
        required: true,
        parse: cell.number({ int: true, min: 1 }),
        hint: 'Cada cuánto se repite, en la unidad del disparador: km, horas o días.',
        example: '10000',
      },
      {
        header: 'Ultimo service (km)',
        field: 'lastServiceKm',
        aliases: ['Último service (km)'],
        parse: cell.number({ int: true, min: 0 }),
        hint: 'Desde acá se calcula el próximo vencimiento por kilómetros.',
        example: '135000',
      },
      {
        header: 'Ultimo service (fecha)',
        field: 'lastServiceAt',
        aliases: ['Último service (fecha)'],
        parse: cell.date(),
        hint: 'Desde acá se calcula el próximo vencimiento por fecha.',
        example: '10/01/2026',
      },
      {
        header: 'Estado',
        field: 'status',
        parse: cell.enumLabel<MaintenancePlanStatus>(PLAN_STATUS_LABELS),
        hint: `Uno de: ${Object.values(PLAN_STATUS_LABELS).join(', ')}. Vacío = Activo.`,
        example: 'Activo',
      },
    ];
  }

  private async planCtx(): Promise<PlanCtx> {
    const trucks = await this.trucksRepository.find();
    return {
      camiones: cell.indexBy(
        trucks,
        (t) => t.plate,
        (t) => t.id,
      ),
    };
  }

  /** La tabla de planes lista todo y filtra en cliente: acá no hay filtros. */
  async exportPlans(): Promise<Buffer> {
    assertExportSize(await this.plansRepository.count());

    const plans = await this.plansRepository.find({
      relations: ['truck'],
      order: { nextDueAt: 'ASC' },
    });

    const columns = [
      'Patente',
      'Plan',
      'Disparador',
      'Intervalo',
      'Ultimo service (km)',
      'Ultimo service (fecha)',
      'Proximo (km)',
      'Proximo (fecha)',
      'Estado',
    ];

    const rows: ExcelRow[] = plans.map((p) => ({
      Patente: p.truck?.plate ?? '',
      Plan: p.name,
      Disparador: TRIGGER_LABELS[p.triggerType] ?? p.triggerType,
      Intervalo: p.intervalValue ?? '',
      'Ultimo service (km)': p.lastServiceKm ?? '',
      'Ultimo service (fecha)': dateCell(p.lastServiceAt),
      'Proximo (km)': p.nextDueKm ?? '',
      'Proximo (fecha)': dateCell(p.nextDueAt),
      Estado: PLAN_STATUS_LABELS[p.status] ?? p.status,
    }));

    return buildXlsx('Planes', columns, rows);
  }

  planTemplate(): Buffer {
    return buildImportTemplate('Planes', this.planColumns());
  }

  async importPlans(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const ctx = await this.planCtx();
    return runExcelImport<any, PlanCtx>({
      buffer,
      dryRun,
      columns: this.planColumns(),
      ctx,
      key: (row) => `${row.truckId}|${String(row.name).toLowerCase()}`,
      find: async (key) => {
        const [truckId] = key.split('|');
        const name = key.slice(truckId.length + 1);
        const plans = await this.plansRepository.find({ where: { truckId } });
        return plans.find((p) => p.name.toLowerCase() === name) ?? null;
      },
      // Vía servicio: respeta el tope de planes del plan contratado y recalcula
      // el próximo vencimiento contra el odómetro real del camión.
      create: (row) => this.maintenanceService.createPlan(row, user),
      update: (existing: MaintenancePlan, row) =>
        this.maintenanceService.updatePlan(existing.id, row, user),
    });
  }

  // ───────────────────── Órdenes de trabajo ─────────────────────

  /**
   * `truckId` opcional: la tabla muestra las órdenes del camión elegido, pero
   * sin filtro baja el historial completo del taller.
   */
  async exportOrders(truckId?: string): Promise<Buffer> {
    const where: FindOptionsWhere<MaintenanceOrder> = {
      ...(truckId && { truckId }),
    };
    assertExportSize(await this.ordersRepository.count({ where }));

    const orders = await this.ordersRepository.find({
      where,
      relations: ['truck'],
      order: { date: 'DESC' },
    });

    const columns = [
      'Patente',
      'Fecha',
      'Odometro (km)',
      'Descripcion',
      'Repuestos y tareas',
      'Costo',
      'Estado',
      'Notas',
    ];

    const rows: ExcelRow[] = orders.map((o) => ({
      Patente: o.truck?.plate ?? '',
      Fecha: dateCell(o.date),
      'Odometro (km)': o.odometerKm ?? '',
      Descripcion: o.description ?? '',
      // Los ítems son un JSON: en la planilla van como texto legible, que es
      // para lo que sirve una columna de Excel.
      'Repuestos y tareas': (o.items ?? [])
        .map((i) => (i.cost ? `${i.name} (${i.cost})` : i.name))
        .join(' | '),
      Costo: Number(o.cost ?? 0),
      Estado: ORDER_STATUS_LABELS[o.status] ?? o.status,
      Notas: o.notes ?? '',
    }));

    return buildXlsx('Ordenes', columns, rows);
  }
}
