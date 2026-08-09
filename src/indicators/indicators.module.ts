import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { IndicatorsService } from './indicators.service';
import { IndicatorsController } from './indicators.controller';
import { AuthModule } from 'src/auth/auth.module';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { Incident } from 'src/incidents/entities/incident.entity';
import { Truck } from 'src/fleet/entities/truck.entity';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([TripLogEntry, Trip, Incident, Truck]),
    forwardRef(() => AuthModule),
  ],
  controllers: [IndicatorsController],
  providers: [IndicatorsService],
})
export class IndicatorsModule {}
