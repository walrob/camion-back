import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Document } from './entities/document.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { AuthModule } from 'src/auth/auth.module';
import { StorageModule } from 'src/common/storage/storage.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { DriversModule } from 'src/drivers/drivers.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([Document, Truck, Trailer]),
    forwardRef(() => AuthModule),
    StorageModule,
    AlertsModule,
    DriversModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
