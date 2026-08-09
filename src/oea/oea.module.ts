import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { OeaInspection } from './entities/oea-inspection.entity';
import { OeaInspectionItem } from './entities/oea-inspection-item.entity';
import { OeaService } from './oea.service';
import { OeaController } from './oea.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([OeaInspection, OeaInspectionItem]),
    forwardRef(() => AuthModule),
    DriversModule,
  ],
  controllers: [OeaController],
  providers: [OeaService],
  exports: [OeaService],
})
export class OeaModule {}
