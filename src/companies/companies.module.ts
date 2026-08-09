import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';

/**
 * Empresas (tenants) de la plataforma.
 *
 * Por ahora solo registra la entidad: sin esto, `autoLoadEntities` de Nest no
 * carga `Company` y toda entidad que la referencie desde `TenantEntity` falla al
 * arrancar con "Entity metadata for X#company was not found". El CLI de TypeORM
 * no lo detecta porque resuelve las entidades por glob, no por módulo.
 *
 * El servicio, el controlador y el alta de empresas llegan en la fase 6
 * (onboarding) del plan SaaS.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  exports: [TypeOrmModule],
})
export class CompaniesModule {}
