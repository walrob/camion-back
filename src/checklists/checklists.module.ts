import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Checklist } from './entities/checklist.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { ChecklistCompanion } from './entities/checklist-companion.entity';
import { ChecklistTemplate } from './entities/checklist-template.entity';
import { ChecklistTemplateItem } from './entities/checklist-template-item.entity';
import { ChecklistsService } from './checklists.service';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistsController } from './checklists.controller';
import { ChecklistTemplatesController } from './checklist-templates.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';
import { AttachmentsModule } from 'src/common/attachments/attachments.module';
import { SettingsModule } from 'src/settings/settings.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Employee } from 'src/hr/entities/employee.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Document } from 'src/documents/entities/document.entity';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([
      Checklist,
      ChecklistItem,
      ChecklistCompanion,
      ChecklistTemplate,
      ChecklistTemplateItem,
      // Entra sólo como entidad: alcanza con leer el tipo de la unidad para
      // elegir la plantilla, y evita acoplar checklists a FleetModule.
      Truck,
      // Ídem para el acompañante que ya está en el sistema: se lee el legajo,
      // su perfil de chofer y si tiene el DNI cargado. Sólo lecturas.
      Employee,
      Driver,
      Document,
    ]),
    forwardRef(() => AuthModule),
    DriversModule,
    // Para verificar que una falla que exige foto la tenga antes de firmar.
    AttachmentsModule,
    // Qué exige la planilla y quién libera la unidad lo decide cada empresa.
    SettingsModule,
    // El aviso al operador de tráfico cuando una planilla no queda conforme.
    AlertsModule,
  ],
  controllers: [ChecklistsController, ChecklistTemplatesController],
  providers: [ChecklistsService, ChecklistTemplatesService],
  exports: [ChecklistsService, ChecklistTemplatesService],
})
export class ChecklistsModule {}
