import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorsService } from './indicators.service';
import { IndicatorsController } from './indicators.controller';
import { AuthModule } from 'src/auth/auth.module';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { Incident } from 'src/incidents/entities/incident.entity';
import { Truck } from 'src/fleet/entities/truck.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TripLogEntry, Trip, Incident, Truck]),
    forwardRef(() => AuthModule),
  ],
  controllers: [IndicatorsController],
  providers: [IndicatorsService],
})
export class IndicatorsModule {}
