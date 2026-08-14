import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { AccountStatusGuard } from 'src/auth/guard/account-status.guard';
import { CompanyStatusCron } from './company-status.cron';
import { AuthModule } from 'src/auth/auth.module';
import { StorageModule } from 'src/common/storage/storage.module';

/**
 * Empresas (tenants) de la plataforma: alta pública, onboarding y datos propios.
 *
 * Registra la entidad `Company` —sin esto `autoLoadEntities` no la carga y toda
 * entidad que la referencie desde `TenantEntity` falla al arrancar— y exporta el
 * `AccountStatusGuard`, que usa `Auth()` desde todos los dominios.
 */
// Global por la misma razón que PlansModule: `AccountStatusGuard` se usa con
// @UseGuards desde `Auth()`, que está en los controladores de todos los
// dominios, y Nest lo instancia en el contexto de cada uno. Sin esto habría
// que importar CompaniesModule en los 20 módulos y olvidarse en uno solo
// dejaría ese controlador sin control de estado de cuenta.
@Global()
@Module({
    // Ciclo deliberado: este módulo usa los guards de Auth y Auth usa este
  // servicio para armar la sesión. forwardRef en los dos lados.
  imports: [
    TypeOrmModule.forFeature([Company]),
    forwardRef(() => AuthModule),
    // Carga del logo de la empresa (onboarding y configuración).
    StorageModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, AccountStatusGuard, CompanyStatusCron],
  exports: [CompaniesService, AccountStatusGuard, CompanyStatusCron, TypeOrmModule],
})
export class CompaniesModule {}
