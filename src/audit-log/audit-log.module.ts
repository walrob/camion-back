import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { AuthModule } from 'src/auth/auth.module';

/**
 * Auditoría transversal.
 *
 * Es `@Global()` porque lo usan facturación, empresas y superadmin: registrar
 * una acción no puede depender de que cada módulo se acuerde de importar esto.
 *
 * `AuditLog` va por `TypeOrmModule` y no por `TenantTypeOrmModule` porque debe
 * poder guardar filas sin empresa (acciones globales del superadmin) y leer de
 * forma transversal; el filtrado lo hace el servicio de forma explícita.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), forwardRef(() => AuthModule)],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
