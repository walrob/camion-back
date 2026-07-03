import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import * as XLSX from 'xlsx';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { Incident } from 'src/incidents/entities/incident.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { IncidentType } from 'src/common/enums/incident.enum';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { IndicatorFilterDto } from './dto/indicator-filter.dto';
import { ExpenseGroup } from './dto/expense-group-filter.dto';
import {
  DateWindowOptions,
  resolveDateWindow,
} from 'src/common/utils/date-window.util';

// Top N de gastos que devuelve el summary (vista de página). El detalle completo
// se obtiene bajo demanda desde el endpoint `expenses`.
const TOP_EXPENSES = 10;

// Ventana de los indicadores (summary + detalle de gastos). Agregación en SQL:
// ajustable de forma independiente al reporte de combustible.
const INDICATORS_WINDOW: DateWindowOptions = { defaultDays: 30, maxMonths: 6 };

@Injectable()
export class IndicatorsService {
  constructor(
    @InjectRepository(TripLogEntry)
    private readonly entriesRepository: Repository<TripLogEntry>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    @InjectRepository(Incident)
    private readonly incidentsRepository: Repository<Incident>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
  ) {}

  // ───────── Filtros ─────────
  private expenseQuery(f: IndicatorFilterDto): SelectQueryBuilder<TripLogEntry> {
    const qb = this.entriesRepository
      .createQueryBuilder('e')
      .leftJoin('e.trip', 't')
      .leftJoin('t.truck', 'truck')
      .leftJoin('t.driver', 'd')
      .leftJoin('d.employee', 'emp');
    if (f.truckId) qb.andWhere('t.truckId = :truckId', { truckId: f.truckId });
    if (f.driverId) qb.andWhere('t.driverId = :driverId', { driverId: f.driverId });
    if (f.fleetId) qb.andWhere('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    if (f.from) qb.andWhere('e.occurredAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('e.occurredAt <= :to', { to: f.to });
    return qb;
  }

  private tripQuery(f: IndicatorFilterDto): SelectQueryBuilder<Trip> {
    const qb = this.tripsRepository
      .createQueryBuilder('t')
      .leftJoin('t.truck', 'truck')
      .where('t.distanceKm IS NOT NULL');
    if (f.truckId) qb.andWhere('t.truckId = :truckId', { truckId: f.truckId });
    if (f.driverId) qb.andWhere('t.driverId = :driverId', { driverId: f.driverId });
    if (f.fleetId) qb.andWhere('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    if (f.from) qb.andWhere('t.finishedAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('t.finishedAt <= :to', { to: f.to });
    return qb;
  }

  // ───────── KPIs ─────────
  private async sumExpenses(f: IndicatorFilterDto, types?: TripLogType[]): Promise<number> {
    const qb = this.expenseQuery(f).select('COALESCE(SUM(e.amount),0)', 's');
    if (types) qb.andWhere('e.type IN (:...types)', { types });
    else qb.andWhere('e.type != :adv', { adv: TripLogType.CASH_ADVANCE });
    const { s } = await qb.getRawOne();
    return Number(s);
  }

  private async sumDistance(f: IndicatorFilterDto): Promise<number> {
    const { s } = await this.tripQuery(f)
      .select('COALESCE(SUM(t.distanceKm),0)', 's')
      .getRawOne();
    return Number(s);
  }

  private async sumLiters(f: IndicatorFilterDto): Promise<number> {
    const { s } = await this.expenseQuery(f)
      .select('COALESCE(SUM(e.liters),0)', 's')
      .andWhere('e.type = :fuel', { fuel: TripLogType.FUEL })
      .getRawOne();
    return Number(s);
  }

  private async expenseByGroup(
    f: IndicatorFilterDto,
    keyExpr: string,
    limit?: number,
  ): Promise<{ key: string; total: number }[]> {
    const qb = this.expenseQuery(f)
      .select(keyExpr, 'k')
      .addSelect('COALESCE(SUM(e.amount),0)', 'total')
      .andWhere('e.type != :adv', { adv: TripLogType.CASH_ADVANCE })
      .groupBy(keyExpr)
      .orderBy('total', 'DESC');
    if (limit) qb.limit(limit);
    const rows = await qb.getRawMany();
    return rows.map((r) => ({ key: r.k ?? '-', total: Number(r.total) }));
  }

  // Expresión de la dimensión a agrupar (patente del camión / nombre del chofer).
  private groupKeyExpr(group: ExpenseGroup): string {
    return group === 'driver'
      ? "CONCAT(emp.firstName, ' ', emp.lastName)"
      : 'truck.plate';
  }

  // Detalle completo (sin límite) de gastos por dimensión, para el modal "Ver todos".
  async expensesByGroup(
    f: IndicatorFilterDto,
    group: ExpenseGroup,
  ): Promise<{ key: string; total: number }[]> {
    const window = resolveDateWindow(f.from, f.to, INDICATORS_WINDOW);
    return this.expenseByGroup({ ...f, ...window }, this.groupKeyExpr(group));
  }

  private async breakdownsByTruck(f: IndicatorFilterDto) {
    const qb = this.incidentsRepository
      .createQueryBuilder('i')
      .leftJoin('i.truck', 'truck')
      .select('truck.plate', 'k')
      .addSelect('COUNT(*)', 'c')
      .where('i.type = :type', { type: IncidentType.MECHANICAL });
    if (f.truckId) qb.andWhere('i.truckId = :truckId', { truckId: f.truckId });
    if (f.fleetId) qb.andWhere('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    if (f.from) qb.andWhere('i.createdAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('i.createdAt <= :to', { to: f.to });
    const rows = await qb.groupBy('truck.plate').orderBy('c', 'DESC').getRawMany();
    return rows.map((r) => ({ key: r.k ?? '-', count: Number(r.c) }));
  }

  private async incidentResolutionAvgHours(f: IndicatorFilterDto): Promise<number> {
    const qb = this.incidentsRepository
      .createQueryBuilder('i')
      .select('AVG(TIMESTAMPDIFF(HOUR, i.createdAt, i.resolvedAt))', 'avg')
      .where('i.resolvedAt IS NOT NULL');
    if (f.truckId) qb.andWhere('i.truckId = :truckId', { truckId: f.truckId });
    if (f.driverId) qb.andWhere('i.driverId = :driverId', { driverId: f.driverId });
    if (f.from) qb.andWhere('i.createdAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('i.createdAt <= :to', { to: f.to });
    const { avg } = await qb.getRawOne();
    return avg ? Number(Number(avg).toFixed(1)) : 0;
  }

  private async fleetAvailability(f: IndicatorFilterDto): Promise<number> {
    const qb = this.trucksRepository.createQueryBuilder('truck');
    if (f.fleetId) qb.where('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    const total = await qb.getCount();
    if (!total) return 0;
    const available = await qb
      .clone()
      .andWhere('truck.status = :st', { st: TruckStatus.AVAILABLE })
      .getCount();
    return Number(((available / total) * 100).toFixed(1));
  }

  async summary(f: IndicatorFilterDto) {
    // Acota siempre la ventana (default/tope configurables por endpoint).
    f = { ...f, ...resolveDateWindow(f.from, f.to, INDICATORS_WINDOW) };
    const [expenses, distance, liters, byTruck, byDriver, extraordinary, breakdowns, resolution, availability] =
      await Promise.all([
        this.sumExpenses(f),
        this.sumDistance(f),
        this.sumLiters(f),
        this.expenseByGroup(f, this.groupKeyExpr('truck'), TOP_EXPENSES),
        this.expenseByGroup(f, this.groupKeyExpr('driver'), TOP_EXPENSES),
        this.sumExpenses(f, [TripLogType.REPAIR, TripLogType.FINE]),
        this.breakdownsByTruck(f),
        this.incidentResolutionAvgHours(f),
        this.fleetAvailability(f),
      ]);

    return {
      costPerKm: distance ? Number((expenses / distance).toFixed(2)) : 0,
      fuelEfficiency: distance ? Number(((liters / distance) * 100).toFixed(2)) : 0,
      totalExpenses: expenses,
      totalDistanceKm: distance,
      extraordinaryCosts: extraordinary,
      incidentResolutionAvgHours: resolution,
      fleetAvailabilityPct: availability,
      expenseByTruck: byTruck,
      expenseByDriver: byDriver,
      breakdownsByTruck: breakdowns,
    };
  }

  async exportXlsx(f: IndicatorFilterDto): Promise<Buffer> {
    // El summary trae solo el top 10; para el Excel exportamos las listas completas.
    const [s, byTruck, byDriver] = await Promise.all([
      this.summary(f),
      this.expensesByGroup(f, 'truck'),
      this.expensesByGroup(f, 'driver'),
    ]);
    const wb = XLSX.utils.book_new();

    const resumen = [
      { Indicador: 'Gasto por km', Valor: s.costPerKm },
      { Indicador: 'Rendimiento (l/100km)', Valor: s.fuelEfficiency },
      { Indicador: 'Gastos totales', Valor: s.totalExpenses },
      { Indicador: 'Distancia total (km)', Valor: s.totalDistanceKm },
      { Indicador: 'Costos extraordinarios', Valor: s.extraordinaryCosts },
      { Indicador: 'Prom. resolución incidentes (h)', Valor: s.incidentResolutionAvgHours },
      { Indicador: 'Disponibilidad de flota (%)', Valor: s.fleetAvailabilityPct },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(byTruck.map((x) => ({ Camion: x.key, Gasto: x.total }))),
      'Gasto x camión',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(byDriver.map((x) => ({ Chofer: x.key, Gasto: x.total }))),
      'Gasto x chofer',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(s.breakdownsByTruck.map((x) => ({ Camion: x.key, Roturas: x.count }))),
      'Roturas',
    );

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
