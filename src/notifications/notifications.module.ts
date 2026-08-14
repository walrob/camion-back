import { forwardRef, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email/email.service';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService],
  // `EmailService` se exporta para la cobranza de la fase 9: los avisos de
  // emisión, mora y bloqueo salen de los crons de facturación.
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
