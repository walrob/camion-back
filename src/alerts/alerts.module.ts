import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from './entities/alert.entity';
import { AlertRuleConfig } from './entities/alert-rule-config.entity';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsGateway } from './alerts.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert, AlertRuleConfig, Truck, Trip, TripLogEntry]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsGateway],
  exports: [AlertsService],
})
export class AlertsModule {}
