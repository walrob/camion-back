import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { MaintenancePlan } from './entities/maintenance-plan.entity';
import { MaintenanceOrder } from './entities/maintenance-order.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceExcelService } from './maintenance-excel.service';
import { MaintenanceController } from './maintenance.controller';
import { AuthModule } from 'src/auth/auth.module';
import { FleetModule } from 'src/fleet/fleet.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { PdfModule } from 'src/common/pdf/pdf.module';

@Module({
  imports: [
    // Truck es solo lectura: la carga de planes resuelve la patente al camion.
    TenantTypeOrmModule.forFeature([MaintenancePlan, MaintenanceOrder, Truck]),
    forwardRef(() => AuthModule),
    FleetModule,
    AlertsModule,
    // Membrete de la orden de trabajo en PDF, con los datos de la empresa.
    PdfModule,
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceExcelService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
