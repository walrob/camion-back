import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlanContextService } from './plan-context.service';
import { CompaniesModule } from 'src/companies/companies.module';
import { FeatureGuard } from 'src/auth/guard/feature.guard';
import { LimitsService } from './limits.service';
import { PlansController } from './plans.controller';
import { StorageReconciliationService } from './storage-reconciliation.service';
import { AlertRuleConfig } from 'src/alerts/entities/alert-rule-config.entity';
import { MaintenancePlan } from 'src/maintenance/entities/maintenance-plan.entity';

/**
 * Catálogo comercial de planes. Es global: no lleva `companyId`, lo comparten
 * todas las empresas.
 *
 * El módulo es `@Global()` porque `FeatureGuard` se usa con `@UseGuards` desde
 * los controladores de todos los dominios, y Nest lo instancia en el contexto de
 * cada uno de esos módulos: sin esto habría que importar `PlansModule` en los 20
 * módulos, y olvidarse en uno solo dejaría ese controlador sin gating.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Plan]),
    CompaniesModule,
    // Los límites de conteo necesitan mirar el estado actual de la empresa.
    // Van sin scopear (TypeOrmModule y no TenantTypeOrmModule) porque el
    // servicio filtra por `companyId` de forma explícita: también lo usan el
    // cron de reconciliación y el superadmin, que operan sobre todas.
    TypeOrmModule.forFeature([AlertRuleConfig, MaintenancePlan]),
  ],
  controllers: [PlansController],
  providers: [
    PlanContextService,
    FeatureGuard,
    LimitsService,
    StorageReconciliationService,
  ],
  exports: [
    PlanContextService,
    FeatureGuard,
    LimitsService,
    StorageReconciliationService,
    TypeOrmModule,
  ],
})
export class PlansModule {}
