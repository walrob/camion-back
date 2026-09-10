import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Driver } from './entities/driver.entity';
import { Employee } from 'src/hr/entities/employee.entity';
import { DriversService } from './drivers.service';
import { DriversExcelService } from './drivers-excel.service';
import { DriversController } from './drivers.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([Driver, Employee]),
    forwardRef(() => AuthModule),
  ],
  controllers: [DriversController],
  providers: [DriversService, DriversExcelService],
  exports: [DriversService],
})
export class DriversModule {}
