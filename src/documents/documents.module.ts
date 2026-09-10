import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Document } from './entities/document.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { DocumentsService } from './documents.service';
import { DocumentsExcelService } from './documents-excel.service';
import { DocumentsController } from './documents.controller';
import { AuthModule } from 'src/auth/auth.module';
import { StorageModule } from 'src/common/storage/storage.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { DriversModule } from 'src/drivers/drivers.module';

@Module({
  imports: [
    // Truck, Trailer y Driver son solo lectura: la carga por Excel resuelve
    // la patente o el DNI al dueño del documento.
    TenantTypeOrmModule.forFeature([Document, Truck, Trailer, Driver]),
    forwardRef(() => AuthModule),
    StorageModule,
    AlertsModule,
    DriversModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsExcelService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
