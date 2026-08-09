import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';

/**
 * Catálogo comercial de planes. Es global: no lleva `companyId`, lo comparten
 * todas las empresas.
 *
 * Igual que `CompaniesModule`, por ahora solo registra la entidad para que Nest
 * la cargue. El gating por plan y sus límites llegan en las fases 3 y 4 del plan
 * SaaS.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Plan])],
  exports: [TypeOrmModule],
})
export class PlansModule {}
