import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlanContextService } from './plan-context.service';
import { CompaniesModule } from 'src/companies/companies.module';
import { FeatureGuard } from 'src/auth/guard/feature.guard';

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
  imports: [TypeOrmModule.forFeature([Plan]), CompaniesModule],
  providers: [PlanContextService, FeatureGuard],
  exports: [PlanContextService, FeatureGuard, TypeOrmModule],
})
export class PlansModule {}
