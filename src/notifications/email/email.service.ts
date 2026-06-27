import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendEmail(to: string, subject: string, html: string) {
    await this.mailerService.sendMail({ to, subject, html });
  }

  async sendEmailUserCreated(email: string) {
    const loginLink = `${process.env.FRONT_URL}/auth/login`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'Tu cuenta en ERP Textil fue creada',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #0b57d0; margin-top: 0;">Bienvenido al ERP Textil</h2>
        <p style="font-size: 16px; color: #333;">
          Se creó una cuenta para vos en el sistema de gestión ERP.
        </p>
        <p style="margin: 24px 0;">
          <a href="${loginLink}" style="background-color: #0b57d0; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Ingresar al sistema
          </a>
        </p>
        <p style="font-size: 14px; color: #555;">
          La contraseña te será proporcionada por el administrador del sistema.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 13px; color: #777; margin: 0;">Saludos,<br/><strong>Equipo ERP Textil</strong></p>
      </div>`,
    });
  }

  async sendQuoteEmail(
    email: string,
    data: { number: string; clientName: string; totalAmount: number; validUntil: string | null },
  ) {
    const validez = data.validUntil
      ? new Date(data.validUntil).toLocaleDateString('es-AR')
      : 'no especificada';

    await this.mailerService.sendMail({
      to: email,
      subject: `Presupuesto ${data.number} - ${data.clientName}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #0b57d0; margin-top: 0;">Presupuesto ${data.number}</h2>
        <p style="font-size: 16px; color: #333;">
          Estimado/a <strong>${data.clientName}</strong>, le enviamos el presupuesto solicitado.
        </p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; color:#555;">Número</td>
            <td style="padding: 8px; font-weight:bold;">${data.number}</td>
          </tr>
          <tr style="background:#f5f8ff;">
            <td style="padding: 8px; color:#555;">Total</td>
            <td style="padding: 8px; font-weight:bold;">$${Number(data.totalAmount).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; color:#555;">Validez</td>
            <td style="padding: 8px;">${validez}</td>
          </tr>
        </table>
        <p style="font-size: 14px; color: #555;">
          Para aprobarlo o realizar consultas, comuníquese con nosotros respondiendo este correo.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 13px; color: #777; margin: 0;">Saludos,<br/><strong>Equipo ERP Textil</strong></p>
      </div>`,
    });
  }

  async sendEmailResetPassword(email: string, token: string) {
    const resetLink = `${process.env.FRONT_URL}/auth/reset-password?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'Restablecé tu contraseña | ERP Textil',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #0b57d0; margin-top: 0;">Restablecer contraseña</h2>
        <p style="font-size: 16px; color: #333;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en el ERP Textil.
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetLink}" style="background-color: #0b57d0; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Restablecer contraseña
          </a>
        </p>
        <p style="font-size: 14px; color: #555;">Si no solicitaste este cambio, podés ignorar este correo.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 13px; color: #777; margin: 0;">Saludos,<br/><strong>Equipo ERP Textil</strong></p>
      </div>`,
    });
  }
}
