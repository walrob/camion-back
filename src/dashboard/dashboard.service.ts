import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository, SelectQueryBuilder } from 'typeorm';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { Incident } from 'src/incidents/entities/incident.entity';
import { Alert } from 'src/alerts/entities/alert.entity';
import { IncidentStatus } from 'src/common/enums/incident.enum';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { AlertStatus } from 'src/common/enums/alert.enum';
import { MaintenanceService } from 'src/maintenance/maintenance.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    @InjectRepository(TripLogEntry)
    private readonly entriesRepository: Repository<TripLogEntry>,
    @InjectRepository(Incident)
    private readonly incidentsRepository: Repository<Incident>,
    @InjectRepository(Alert)
    private readonly alertsRepository: Repository<Alert>,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  async getOverview(range: 'today' | '7d' | '30d' = '7d') {
    const [
      trucksByStatus,
      incidentsBySeverity,
      activeAlertsByLevel,
      todayExpenses,
      delayedTrips,
      driversWithNews,
      upcoming,
      openIncidents,
      trends,
    ] = await Promise.all([
      this.groupCount(this.trucksRepository, 'status'),
      this.incidentsBySeverity(),
      this.alertsByLevel(),
      this.todayExpenses(),
      this.delayedTrips(),
      this.driversWithNews(),
      this.maintenanceService.upcoming(),
      this.incidentsRepository.count({
        where: { status: Not(IncidentStatus.RESOLVED) },
      }),
      this.buildTrends(range),
    ]);

    return {
      range,
      trucksByStatus,
      incidents: {
        open: openIncidents,
        bySeverity: incidentsBySeverity,
      },
      alerts: {
        active: Object.values(activeAlertsByLevel).reduce((a, b) => a + b, 0),
        byLevel: activeAlertsByLevel,
      },
      todayExpenses,
      delayedTrips,
      driversWithNews,
      upcomingMaintenance: upcoming.length,
      trends,
    };
  }

  /**
   * Bloque de tendencias del período: para cada métrica devuelve el valor del
   * período actual, el del período inmediatamente anterior de igual duración
   * (para calcular delta%) y la serie diaria (sparkline) de largo fijo.
   */
  private async buildTrends(range: 'today' | '7d' | '30d') {
    const days = range === 'today' ? 1 : range === '30d' ? 30 : 7;

    const now = new Date();
    // Inicio del período actual: 00:00 del primer día de la ventana.
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    // Ventana anterior de igual duración: [prevStart, prevEnd], terminando 1ms
    // antes del inicio del período actual para no solapar el borde.
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
    const prevEnd = new Date(start.getTime() - 1);

    const [
      expensesSeries,
      expensesPrev,
      tripsSeries,
      tripsPrev,
      incidentsSeries,
      incidentsPrev,
    ] = await Promise.all([
      // expenses: SUM(amount) excluyendo CASH_ADVANCE, por occurredAt.
      this.dailySeries(
        this.entriesRepository,
        'e.occurredAt',
        'COALESCE(SUM(e.amount), 0)',
        start,
        now,
        days,
        (qb) =>
          qb.andWhere('e.type != :advance', {
            advance: TripLogType.CASH_ADVANCE,
          }),
      ),
      this.aggWindow(
        this.entriesRepository,
        'e.occurredAt',
        'COALESCE(SUM(e.amount), 0)',
        prevStart,
        prevEnd,
        (qb) =>
          qb.andWhere('e.type != :advance', {
            advance: TripLogType.CASH_ADVANCE,
          }),
      ),
      // tripsFinished: COUNT(Trip) status=finished, por finishedAt.
      this.dailySeries(
        this.tripsRepository,
        'e.finishedAt',
        'COUNT(*)',
        start,
        now,
        days,
        (qb) =>
          qb.andWhere('e.status = :finished', {
            finished: TripStatus.FINISHED,
          }),
      ),
      this.aggWindow(
        this.tripsRepository,
        'e.finishedAt',
        'COUNT(*)',
        prevStart,
        prevEnd,
        (qb) =>
          qb.andWhere('e.status = :finished', {
            finished: TripStatus.FINISHED,
          }),
      ),
      // incidentsReported: COUNT(Incident) por createdAt.
      this.dailySeries(
        this.incidentsRepository,
        'e.createdAt',
        'COUNT(*)',
        start,
        now,
        days,
      ),
      this.aggWindow(
        this.incidentsRepository,
        'e.createdAt',
        'COUNT(*)',
        prevStart,
        prevEnd,
      ),
    ]);

    const sum = (s: number[]) => s.reduce((a, b) => a + b, 0);

    return {
      expenses: {
        value: Math.round(sum(expensesSeries) * 100) / 100,
        previousValue: expensesPrev,
        series: expensesSeries,
      },
      tripsFinished: {
        value: sum(tripsSeries),
        previousValue: tripsPrev,
        series: tripsSeries,
      },
      incidentsReported: {
        value: sum(incidentsSeries),
        previousValue: incidentsPrev,
        series: incidentsSeries,
      },
    };
  }

  /**
   * Serie diaria agregada dentro de [start, end] con largo fijo `days` en orden
   * cronológico ascendente, completando con 0 los días sin datos. Usa DATEDIFF
   * para asignar cada fila a su bucket de día sin traer filas a memoria.
   */
  private async dailySeries(
    repo: Repository<any>,
    dateCol: string,
    agg: string,
    start: Date,
    end: Date,
    days: number,
    applyFilters?: (qb: SelectQueryBuilder<any>) => void,
  ): Promise<number[]> {
    const qb = repo
      .createQueryBuilder('e')
      .select(`DATEDIFF(${dateCol}, :start)`, 'idx')
      .addSelect(agg, 'v')
      .where(`${dateCol} BETWEEN :start AND :end`, { start, end })
      .groupBy('idx');
    applyFilters?.(qb);

    const rows = await qb.getRawMany<{ idx: string; v: string }>();
    const series = new Array<number>(days).fill(0);
    for (const r of rows) {
      const i = Number(r.idx);
      if (i >= 0 && i < days) series[i] = Number(r.v);
    }
    return series;
  }

  /** Valor agregado escalar dentro de [start, end]. */
  private async aggWindow(
    repo: Repository<any>,
    dateCol: string,
    agg: string,
    start: Date,
    end: Date,
    applyFilters?: (qb: SelectQueryBuilder<any>) => void,
  ): Promise<number> {
    const qb = repo
      .createQueryBuilder('e')
      .select(agg, 'v')
      .where(`${dateCol} BETWEEN :start AND :end`, { start, end });
    applyFilters?.(qb);

    const row = await qb.getRawOne<{ v: string }>();
    return Math.round(Number(row?.v ?? 0) * 100) / 100;
  }

  private async groupCount(
    repo: Repository<any>,
    field: string,
  ): Promise<Record<string, number>> {
    const rows = await repo
      .createQueryBuilder('e')
      .select(`e.${field}`, 'k')
      .addSelect('COUNT(*)', 'c')
      .groupBy(`e.${field}`)
      .getRawMany();
    return rows.reduce((acc, r) => ({ ...acc, [r.k]: Number(r.c) }), {});
  }

  private async incidentsBySeverity(): Promise<Record<string, number>> {
    const rows = await this.incidentsRepository
      .createQueryBuilder('i')
      .select('i.severity', 'k')
      .addSelect('COUNT(*)', 'c')
      .where('i.status != :resolved', { resolved: IncidentStatus.RESOLVED })
      .groupBy('i.severity')
      .getRawMany();
    return rows.reduce((acc, r) => ({ ...acc, [r.k]: Number(r.c) }), {});
  }

  private async alertsByLevel(): Promise<Record<string, number>> {
    const rows = await this.alertsRepository
      .createQueryBuilder('a')
      .select('a.level', 'k')
      .addSelect('COUNT(*)', 'c')
      .where('a.status != :resolved', { resolved: AlertStatus.RESOLVED })
      .groupBy('a.level')
      .getRawMany();
    return rows.reduce((acc, r) => ({ ...acc, [r.k]: Number(r.c) }), {});
  }

  private async todayExpenses(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { sum } = await this.entriesRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'sum')
      .where('e.occurredAt BETWEEN :start AND :end', { start, end })
      .andWhere('e.type != :advance', { advance: TripLogType.CASH_ADVANCE })
      .getRawOne();
    return Number(sum);
  }

  private delayedTrips(): Promise<number> {
    return this.tripsRepository
      .createQueryBuilder('t')
      .where('t.status = :status', { status: TripStatus.IN_PROGRESS })
      .andWhere('t.plannedEndAt IS NOT NULL')
      .andWhere('t.plannedEndAt < :now', { now: new Date() })
      .getCount();
  }

  private async driversWithNews(): Promise<number> {
    const { count } = await this.incidentsRepository
      .createQueryBuilder('i')
      .select('COUNT(DISTINCT i.driverId)', 'count')
      .where('i.status != :resolved', { resolved: IncidentStatus.RESOLVED })
      .getRawOne();
    return Number(count);
  }
}
