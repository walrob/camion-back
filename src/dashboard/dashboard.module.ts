import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MaintenanceModule } from 'src/maintenance/maintenance.module';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { Incident } from 'src/incidents/entities/incident.entity';
import { Alert } from 'src/alerts/entities/alert.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Truck, Trip, TripLogEntry, Incident, Alert]),
    forwardRef(() => AuthModule),
    MaintenanceModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
