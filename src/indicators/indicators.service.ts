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
      .leftJoin('d.user', 'u');
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
    alias: string,
  ): Promise<{ key: string; total: number }[]> {
    const rows = await this.expenseQuery(f)
      .select(keyExpr, 'k')
      .addSelect('COALESCE(SUM(e.amount),0)', 'total')
      .andWhere('e.type != :adv', { adv: TripLogType.CASH_ADVANCE })
      .groupBy(keyExpr)
      .orderBy('total', 'DESC')
      .getRawMany();
    return rows.map((r) => ({ key: r.k ?? '-', total: Number(r.total) }));
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
    const [expenses, distance, liters, byTruck, byDriver, extraordinary, breakdowns, resolution, availability] =
      await Promise.all([
        this.sumExpenses(f),
        this.sumDistance(f),
        this.sumLiters(f),
        this.expenseByGroup(f, 'truck.plate', 'truck'),
        this.expenseByGroup(f, 'u.name', 'driver'),
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
    const s = await this.summary(f);
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
      XLSX.utils.json_to_sheet(s.expenseByTruck.map((x) => ({ Camion: x.key, Gasto: x.total }))),
      'Gasto x camión',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(s.expenseByDriver.map((x) => ({ Chofer: x.key, Gasto: x.total }))),
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
