import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Checklist } from './entities/checklist.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { ChecklistsService } from './checklists.service';
import { ChecklistsController } from './checklists.controller';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Checklist, ChecklistItem]),
    forwardRef(() => AuthModule),
    DriversModule,
  ],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
