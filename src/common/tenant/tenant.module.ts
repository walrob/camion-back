import { Global, Module } from '@nestjs/common';
import { TenantSubscriber } from './tenant.subscriber';

/**
 * Registra la red de seguridad del aislamiento entre empresas.
 *
 * Es global porque el `TenantSubscriber` se engancha al DataSource y actúa sobre
 * todas las entidades: no tiene sentido importarlo módulo por módulo.
 */
@Global()
@Module({
  providers: [TenantSubscriber],
  exports: [TenantSubscriber],
})
export class TenantModule {}
