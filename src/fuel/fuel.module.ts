import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { FuelRecord } from './entities/fuel-record.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Settlement } from 'src/settlements/entities/settlement.entity';
import { FuelService } from './fuel.service';
import { FuelController } from './fuel.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';

@Module({
  imports: [
    // `Settlement` entra sólo como entidad: alcanza para saber si la carga ya
    // se liquidó, sin depender del módulo de liquidaciones.
    TenantTypeOrmModule.forFeature([FuelRecord, Truck, Settlement]),
    forwardRef(() => AuthModule),
    DriversModule,
  ],
  controllers: [FuelController],
  providers: [FuelService],
  exports: [FuelService],
})
export class FuelModule {}
