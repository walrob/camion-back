import { Injectable } from '@nestjs/common';
import { EmailService } from './email/email.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly emailService: EmailService) {}

  async sendEmailUserCreated(email: string) {
    await this.emailService.sendEmailUserCreated(email);
  }

  async sendEmailResetPassword(email: string, token: string) {
    await this.emailService.sendEmailResetPassword(email, token);
  }

  async sendQuoteEmail(
    email: string,
    data: { number: string; clientName: string; totalAmount: number; validUntil: string | null },
  ) {
    await this.emailService.sendQuoteEmail(email, data);
  }
}
