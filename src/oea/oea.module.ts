import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OeaInspection } from './entities/oea-inspection.entity';
import { OeaInspectionItem } from './entities/oea-inspection-item.entity';
import { OeaService } from './oea.service';
import { OeaController } from './oea.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OeaInspection, OeaInspectionItem]),
    forwardRef(() => AuthModule),
    DriversModule,
  ],
  controllers: [OeaController],
  providers: [OeaService],
  exports: [OeaService],
})
export class OeaModule {}
