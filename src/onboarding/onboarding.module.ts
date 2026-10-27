import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { AuthModule } from 'src/auth/auth.module';
import { Company } from 'src/companies/entities/company.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Document } from 'src/documents/entities/document.entity';
import { Trip } from 'src/trips/entities/trip.entity';

/** Guía de primeros pasos del panel gerencial. */
@Module({
  imports: [
    // `Company` no es de tenant: se busca por id, que ya es la empresa propia.
    TypeOrmModule.forFeature([Company]),
    TenantTypeOrmModule.forFeature([Truck, Driver, Document, Trip]),
    forwardRef(() => AuthModule),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
