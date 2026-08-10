import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './entities/trip.entity';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { AuthModule } from 'src/auth/auth.module';
import { FleetModule } from 'src/fleet/fleet.module';
import { DriversModule } from 'src/drivers/drivers.module';
import { ChecklistsModule } from 'src/checklists/checklists.module';
import { HrModule } from 'src/hr/hr.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { SequencesModule } from 'src/common/sequences/sequences.module';
import { Trailer } from 'src/fleet/entities/trailer.entity';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([Trip, Trailer]),
    forwardRef(() => AuthModule),
    FleetModule,
    DriversModule,
    ChecklistsModule,
    // Para validar la situación del legajo del chofer al asignarle un viaje.
    HrModule,
    AlertsModule,
    // Correlativos por empresa para el código visible.
    SequencesModule,
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
