import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Invite } from './entities/invite.entity';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

/**
 * Invitaciones para sumar gente a una empresa.
 *
 * `Invite` va por `TenantTypeOrmModule` para heredar el filtrado por empresa en
 * las rutas autenticadas; las públicas (ver y aceptar) abren contexto de sistema
 * de forma explícita, porque quien las usa todavía no tiene empresa.
 */
@Module({
  imports: [
    TenantTypeOrmModule.forFeature([Invite]),
    forwardRef(() => AuthModule),
    // El mail con el link: sin él la invitación hay que pasarla a mano.
    NotificationsModule,
  ],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
