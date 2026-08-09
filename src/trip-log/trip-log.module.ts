import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { TripLogEntry } from './entities/trip-log-entry.entity';
import { TripLogService } from './trip-log.service';
import { TripLogController } from './trip-log.controller';
import { AuthModule } from 'src/auth/auth.module';
import { TripsModule } from 'src/trips/trips.module';
import { DriversModule } from 'src/drivers/drivers.module';
import { AlertsModule } from 'src/alerts/alerts.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([TripLogEntry]),
    forwardRef(() => AuthModule),
    TripsModule,
    DriversModule,
    AlertsModule,
  ],
  controllers: [TripLogController],
  providers: [TripLogService],
  exports: [TripLogService],
})
export class TripLogModule {}
