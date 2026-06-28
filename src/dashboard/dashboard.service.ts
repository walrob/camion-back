import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Not, Repository } from 'typeorm';
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

  async getOverview() {
    const [
      trucksByStatus,
      incidentsBySeverity,
      activeAlertsByLevel,
      todayExpenses,
      delayedTrips,
      driversWithNews,
      upcoming,
      openIncidents,
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
    ]);

    return {
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
    };
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
