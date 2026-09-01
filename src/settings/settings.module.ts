import { forwardRef, Global, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { CompanySetting } from './entities/company-setting.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuthModule } from 'src/auth/auth.module';

/**
 * `@Global()` por la misma razón que `AuditLogModule`: los ajustes los consulta
 * cualquier dominio —viajes, rendiciones, combustible, y los que vengan— y no
 * tiene sentido importar este módulo en veinte lugares. Olvidarse en uno sólo
 * dejaría ese dominio operando con constantes en vez de con la configuración
 * del cliente, que es exactamente el problema que este módulo viene a resolver.
 */
@Global()
@Module({
  imports: [
    TenantTypeOrmModule.forFeature([CompanySetting]),
    forwardRef(() => AuthModule),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
