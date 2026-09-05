import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
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
import { PdfModule } from 'src/common/pdf/pdf.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([Settlement, Trip]),
    forwardRef(() => AuthModule),
    TripsModule,
    TripLogModule,
    StorageModule,
    // Membrete de la liquidación en PDF, con los datos de la empresa.
    PdfModule,
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
