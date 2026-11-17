import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AuthModule } from 'src/auth/auth.module';
import { EmailLog } from './entities/email-log.entity';
import { EngagementService } from './engagement.service';
import {
  EngagementAdminController,
  EngagementController,
} from './engagement.controller';

/**
 * Emails automáticos de activación y re-enganche para quien da de alta una
 * empresa: correo sin confirmar, empresa sin viajes, primer viaje e
 * inactividad. Ver `EngagementService`.
 */
@Module({
  imports: [
    // Registra la entidad en el DataSource; el servicio la lee en contexto de
    // sistema porque recorre todas las empresas.
    TypeOrmModule.forFeature([EmailLog]),
    // EmailService. forwardRef por la cadena Notifications ↔ Auth.
    forwardRef(() => NotificationsModule),
    // JwtService (el link de verificación del segmento A) y los guards de
    // `@Auth` del panel del superadmin.
    forwardRef(() => AuthModule),
  ],
  controllers: [EngagementController, EngagementAdminController],
  providers: [EngagementService],
})
export class EngagementModule {}
