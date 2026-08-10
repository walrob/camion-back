import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Company } from 'src/companies/entities/company.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';
import { Addon } from './entities/addon.entity';
import { CompanyAddon } from './entities/company-addon.entity';
import { VehicleBillingSnapshot } from './entities/vehicle-billing-snapshot.entity';
import { CompanyPlanUpdate } from './entities/company-plan-update.entity';
import { BillingService } from './billing.service';
import { BillingCron } from './billing.cron';
import { BillingController } from './billing.controller';
import { AuthModule } from 'src/auth/auth.module';

/**
 * Facturación: emisión de períodos, prorrateos, add-ons y cambios de plan.
 *
 * Las entidades de empresa van por `TenantTypeOrmModule` para heredar el
 * filtrado automático. `Company`, `Plan` y `Addon` son catálogo/raíz y van por
 * el módulo estándar: el servicio y los crons necesitan verlas de todas las
 * empresas, y filtran por `companyId` de forma explícita cuando corresponde.
 */
@Module({
  imports: [
    TenantTypeOrmModule.forFeature([
      Subscription,
      Payment,
      CompanyAddon,
      VehicleBillingSnapshot,
      CompanyPlanUpdate,
      Truck,
      Trailer,
    ]),
    TypeOrmModule.forFeature([Company, Plan, Addon]),
    // El controlador usa @Auth(): necesita el JwtModule que exporta AuthModule.
    forwardRef(() => AuthModule),
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingCron],
  exports: [BillingService],
})
export class BillingModule {}
