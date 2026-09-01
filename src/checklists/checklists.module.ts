import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Checklist } from './entities/checklist.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { ChecklistTemplate } from './entities/checklist-template.entity';
import { ChecklistTemplateItem } from './entities/checklist-template-item.entity';
import { ChecklistsService } from './checklists.service';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistsController } from './checklists.controller';
import { ChecklistTemplatesController } from './checklist-templates.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';
import { AttachmentsModule } from 'src/common/attachments/attachments.module';
import { Truck } from 'src/fleet/entities/truck.entity';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([
      Checklist,
      ChecklistItem,
      ChecklistTemplate,
      ChecklistTemplateItem,
      // Entra sólo como entidad: alcanza con leer el tipo de la unidad para
      // elegir la plantilla, y evita acoplar checklists a FleetModule.
      Truck,
    ]),
    forwardRef(() => AuthModule),
    DriversModule,
    // Para verificar que una falla que exige foto la tenga antes de firmar.
    AttachmentsModule,
  ],
  controllers: [ChecklistsController, ChecklistTemplatesController],
  providers: [ChecklistsService, ChecklistTemplatesService],
  exports: [ChecklistsService, ChecklistTemplatesService],
})
export class ChecklistsModule {}
