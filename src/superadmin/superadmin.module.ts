import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { User } from 'src/users/entities/user.entity';
import { AuthModule } from 'src/auth/auth.module';
import { BillingModule } from 'src/billing/billing.module';
import { SuperadminService } from './superadmin.service';
import { SuperadminController } from './superadmin.controller';
import { ImpersonationService } from './impersonation.service';

/**
 * Operación de la plataforma.
 *
 * Las entidades van por `TypeOrmModule` y no por `TenantTypeOrmModule` a
 * propósito: el superadmin necesita verlas de todas las empresas. El acceso
 * transversal se declara en el contexto (`runAsSystem`) y queda auditado; no es
 * un efecto lateral de no filtrar.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Company, Plan, User]),
    forwardRef(() => AuthModule),
    BillingModule,
  ],
  controllers: [SuperadminController],
  providers: [SuperadminService, ImpersonationService],
  exports: [SuperadminService],
})
export class SuperadminModule {}
