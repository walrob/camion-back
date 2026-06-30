import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FuelRecord } from './entities/fuel-record.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { FuelService } from './fuel.service';
import { FuelController } from './fuel.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FuelRecord, Truck]),
    forwardRef(() => AuthModule),
    DriversModule,
  ],
  controllers: [FuelController],
  providers: [FuelService],
  exports: [FuelService],
})
export class FuelModule {}
