import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settlement } from './entities/settlement.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { AuthModule } from 'src/auth/auth.module';
import { TripsModule } from 'src/trips/trips.module';
import { TripLogModule } from 'src/trip-log/trip-log.module';
import { StorageModule } from 'src/common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, Trip]),
    forwardRef(() => AuthModule),
    TripsModule,
    TripLogModule,
    StorageModule,
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
