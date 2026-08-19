import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { TenantSubscriber } from './tenant.subscriber';
import { TenantCronRunner } from './tenant-cron.runner';

/**
 * Registra la red de seguridad del aislamiento entre empresas.
 *
 * Es global porque el `TenantSubscriber` se engancha al DataSource y actúa sobre
 * todas las entidades: no tiene sentido importarlo módulo por módulo. Por la
 * misma razón se exporta acá el `TenantCronRunner`: lo usan los crons de media
 * docena de dominios y es infraestructura del tenant, no de ninguno de ellos.
 *
 * `Company` va con `TypeOrmModule.forFeature` y no con `TenantTypeOrmModule`:
 * es catálogo global, no tiene `companyId` y no debe filtrarse.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  providers: [TenantSubscriber, TenantCronRunner],
  exports: [TenantSubscriber, TenantCronRunner],
})
export class TenantModule {}
