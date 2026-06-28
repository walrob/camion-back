import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './entities/trip.entity';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { AuthModule } from 'src/auth/auth.module';
import { FleetModule } from 'src/fleet/fleet.module';
import { DriversModule } from 'src/drivers/drivers.module';
import { ChecklistsModule } from 'src/checklists/checklists.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip]),
    forwardRef(() => AuthModule),
    FleetModule,
    DriversModule,
    ChecklistsModule,
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
