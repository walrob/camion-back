import { Injectable, Logger } from '@nestjs/common';
import { ISendMailOptions, MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  /**
   * Única salida de correo del sistema.
   *
   * Con `EMAIL_ENABLED=false` no manda nada y deja constancia en el log. Existe
   * por los tests de integración: el alta de una empresa y cada invitación
   * disparan un envío real, así que sin este interruptor la suite abre una
   * conexión SMTP por caso —lenta, dependiente de la red y capaz de mandarle un
   * correo a una dirección de verdad si alguien la usa como dato de prueba—.
   *
   * Se apaga sólo con el valor exacto `false`: una variable sin definir deja el
   * correo andando, que es lo que hace falta en desarrollo y en producción.
   */
  private async despachar(opciones: ISendMailOptions): Promise<void> {
    if (process.env.EMAIL_ENABLED === 'false') {
      this.logger.log(
        `[EMAIL_ENABLED=false] No se envía "${opciones.subject}" a ${String(opciones.to)}.`,
      );
      return;
    }

    await this.mailerService.sendMail(opciones);
  }

  async sendEmail(to: string, subject: string, html: string) {
    await this.despachar({ to, subject, html });
  }

  async sendEmailUserCreated(email: string) {
    const loginLink = `${process.env.FRONT_URL}/auth/login`;

    await this.despachar({
      to: email,
      subject: 'Tu cuenta en FleetLog fue creada',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #0b57d0; margin-top: 0;">Bienvenido al FleetLog</h2>
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
        <p style="font-size: 13px; color: #777; margin: 0;">Saludos,<br/><strong>Equipo FleetLog</strong></p>
      </div>`,
    });
  }

  async sendQuoteEmail(
    email: string,
    data: {
      number: string;
      clientName: string;
      totalAmount: number;
      validUntil: string | null;
    },
  ) {
    const validez = data.validUntil
      ? new Date(data.validUntil).toLocaleDateString('es-AR')
      : 'no especificada';

    await this.despachar({
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
            <td style="padding: 8px; font-weight:bold;">${new Intl.NumberFormat(
              'es-AR',
              {
                style: 'currency',
                currency: 'ARS',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            ).format(Number(data.totalAmount) || 0)}</td>
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
        <p style="font-size: 13px; color: #777; margin: 0;">Saludos,<br/><strong>Equipo FleetLog</strong></p>
      </div>`,
    });
  }

  // ───────────────────────── Cobranza (fase 9) ─────────────────────────────

  /**
   * Cuerpo común de los avisos de la plataforma.
   *
   * Los mails del ciclo comercial (emisión, aviso de vencimiento, pago
   * recibido, mora y bloqueo) y los del alta (verificación, invitación)
   * comparten maquetado a propósito: son la misma conversación con el cliente,
   * y que uno se vea distinto lo hace parecer phishing justo cuando se le está
   * pidiendo que haga clic o que pague.
   */
  private plantilla(params: {
    titulo: string;
    color: string;
    cuerpo: string;
    cta?: { texto: string; url: string };
  }): string {
    const boton = params.cta
      ? `<p style="margin: 24px 0;">
          <a href="${params.cta.url}" style="background-color: ${params.color}; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            ${params.cta.texto}
          </a>
        </p>`
      : '';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: ${params.color}; margin-top: 0;">${params.titulo}</h2>
        ${params.cuerpo}
        ${boton}
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 13px; color: #777; margin: 0;">Saludos,<br/><strong>Equipo FleetLog</strong></p>
      </div>`;
  }

  /** `$ 283.800,00`. Mismo formato que ve el cliente en la aplicación. */
  private importe(valor: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(valor) || 0);
  }

  private fecha(valor: Date | string): string {
    return new Date(valor).toLocaleDateString('es-AR');
  }

  private get linkDePago(): string {
    return `${process.env.FRONT_URL}/estado-plan`;
  }

  /** Se emitió el período del mes. */
  async sendPeriodoEmitido(
    to: string,
    datos: { periodStart: Date; periodEnd: Date; amount: number; expiration: Date },
  ) {
    await this.despachar({
      to,
      subject: `Tu factura de FleetLog — ${this.fecha(datos.periodStart)}`,
      html: this.plantilla({
        titulo: 'Se emitió tu período mensual',
        color: '#0b57d0',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            Período <strong>${this.fecha(datos.periodStart)}</strong> al
            <strong>${this.fecha(datos.periodEnd)}</strong>.
          </p>
          <p style="font-size: 20px; color: #111; margin: 16px 0;">
            <strong>${this.importe(datos.amount)}</strong>
            <span style="font-size: 14px; color: #666;"> — vence el ${this.fecha(datos.expiration)}</span>
          </p>
          <p style="font-size: 14px; color: #555;">
            Podés ver el detalle de lo facturado y pagarlo desde tu panel.
          </p>`,
        cta: { texto: 'Ver y pagar', url: this.linkDePago },
      }),
    });
  }

  /** Faltan pocos días para el vencimiento y sigue impago. */
  async sendVencimientoProximo(
    to: string,
    datos: { amount: number; expiration: Date; dias: number },
  ) {
    await this.despachar({
      to,
      subject: `Tu factura de FleetLog vence en ${datos.dias} día${datos.dias === 1 ? '' : 's'}`,
      html: this.plantilla({
        titulo: 'Tenés un pago por vencer',
        color: '#b26a00',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            Queda pendiente <strong>${this.importe(datos.amount)}</strong>, con
            vencimiento el <strong>${this.fecha(datos.expiration)}</strong>.
          </p>
          <p style="font-size: 14px; color: #555;">
            Si ya lo pagaste, ignorá este correo: la acreditación puede demorar
            unas horas.
          </p>`,
        cta: { texto: 'Pagar ahora', url: this.linkDePago },
      }),
    });
  }

  /** Se acreditó un pago. */
  async sendPagoRecibido(to: string, datos: { amount: number; periodStart: Date }) {
    await this.despachar({
      to,
      subject: 'Recibimos tu pago | FleetLog',
      html: this.plantilla({
        titulo: '¡Pago acreditado!',
        color: '#1b7f45',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            Registramos tu pago de <strong>${this.importe(datos.amount)}</strong>
            correspondiente al período del ${this.fecha(datos.periodStart)}.
          </p>
          <p style="font-size: 14px; color: #555;">
            Tu cuenta queda al día. Gracias.
          </p>`,
        cta: { texto: 'Ver mi plan', url: this.linkDePago },
      }),
    });
  }

  /** Venció sin pago: la cuenta pasa a mora, todavía sin bloqueo. */
  async sendCuentaEnMora(
    to: string,
    datos: { amount: number; diasDeGracia: number; bloqueaEl: Date },
  ) {
    await this.despachar({
      to,
      subject: 'Tenés un pago vencido | FleetLog',
      html: this.plantilla({
        titulo: 'Tu cuenta quedó con un pago vencido',
        color: '#b26a00',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            Hay <strong>${this.importe(datos.amount)}</strong> pendientes de pago.
          </p>
          <p style="font-size: 14px; color: #555;">
            Podés seguir usando FleetLog con normalidad durante
            <strong>${datos.diasDeGracia} días</strong>. Si no llegamos a
            registrar el pago antes del
            <strong>${this.fecha(datos.bloqueaEl)}</strong>, la cuenta pasa a
            solo lectura: vas a poder consultar toda tu información, pero no
            cargar novedades. <strong>Tus datos no se borran.</strong>
          </p>`,
        cta: { texto: 'Regularizar', url: this.linkDePago },
      }),
    });
  }

  /** Se agotó la gracia: la cuenta pasa a solo lectura. */
  async sendCuentaBloqueada(to: string, datos: { amount: number }) {
    await this.despachar({
      to,
      subject: 'Tu cuenta de FleetLog pasó a solo lectura',
      html: this.plantilla({
        titulo: 'Cuenta suspendida por falta de pago',
        color: '#b3261e',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            Quedaron <strong>${this.importe(datos.amount)}</strong> sin pagar
            después del período de gracia, así que la cuenta pasó a
            <strong>solo lectura</strong>.
          </p>
          <p style="font-size: 14px; color: #555;">
            Seguís viendo toda tu información y podés seguir descargando lo que
            necesites. <strong>No se borró nada.</strong> Apenas se acredite el
            pago, la cuenta se reactiva sola.
          </p>`,
        cta: { texto: 'Pagar y reactivar', url: this.linkDePago },
      }),
    });
  }

  /** Faltan 7, 3 o 1 días para que termine la prueba gratuita. */
  async sendTrialPorVencer(to: string, datos: { dias: number; terminaEl: Date }) {
    await this.despachar({
      to,
      subject: `Te quedan ${datos.dias} día${datos.dias === 1 ? '' : 's'} de prueba en FleetLog`,
      html: this.plantilla({
        titulo: `Tu prueba termina el ${this.fecha(datos.terminaEl)}`,
        color: '#0b57d0',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            Te quedan <strong>${datos.dias} día${datos.dias === 1 ? '' : 's'}</strong>
            de prueba gratuita.
          </p>
          <p style="font-size: 14px; color: #555;">
            Cuando termine, la cuenta pasa a solo lectura hasta que actives un
            plan. <strong>Tus datos no se borran</strong> y todo vuelve a
            funcionar apenas contrates.
          </p>`,
        cta: { texto: 'Ver planes', url: this.linkDePago },
      }),
    });
  }

  /**
   * Aviso interno: hay cuentas a un día del bloqueo.
   *
   * Es la mitigación de R9.3. Un bloqueo automático sobre un cliente que sí
   * pagó —una transferencia sin conciliar, un webhook que no llegó— se arregla
   * en un minuto si alguien lo ve venir, y cuesta un cliente si se entera el
   * cliente primero.
   */
  async sendAvisoBloqueoInminente(
    to: string,
    empresas: { name: string; amount: number; bloqueaEl: Date }[],
  ) {
    const filas = empresas
      .map(
        (e) => `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${this.importe(e.amount)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${this.fecha(e.bloqueaEl)}</td>
          </tr>`,
      )
      .join('');

    await this.despachar({
      to,
      subject: `[FleetLog] ${empresas.length} cuenta(s) por bloquearse mañana`,
      html: this.plantilla({
        titulo: 'Cuentas a un día del bloqueo',
        color: '#b3261e',
        cuerpo: `
          <p style="font-size: 14px; color: #555;">
            Se bloquean mañana si no se registra el pago. Revisá si alguna pagó
            por fuera de Mercado Pago antes de que el cron las suspenda.
          </p>
          <table style="width:100%; border-collapse:collapse; margin: 16px 0; font-size: 14px;">
            <tr style="background:#f5f8ff;">
              <th style="padding: 8px; text-align:left;">Empresa</th>
              <th style="padding: 8px; text-align:right;">Deuda</th>
              <th style="padding: 8px; text-align:left;">Bloqueo</th>
            </tr>
            ${filas}
          </table>`,
        cta: {
          texto: 'Abrir cobranzas',
          url: `${process.env.FRONT_URL}/superadmin/cobranzas`,
        },
      }),
    });
  }

  async sendEmailResetPassword(email: string, token: string) {
    const resetLink = `${process.env.FRONT_URL}/auth/reset-password?token=${token}`;

    await this.despachar({
      to: email,
      subject: 'Restablecé tu contraseña | FleetLog',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #0b57d0; margin-top: 0;">Restablecer contraseña</h2>
        <p style="font-size: 16px; color: #333;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en el FleetLog.
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetLink}" style="background-color: #0b57d0; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Restablecer contraseña
          </a>
        </p>
        <p style="font-size: 14px; color: #555;">Si no solicitaste este cambio, podés ignorar este correo.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 13px; color: #777; margin: 0;">Saludos,<br/><strong>Equipo FleetLog</strong></p>
      </div>`,
    });
  }

  /**
   * Confirmación de la casilla en el alta pública.
   *
   * Es el único mail cuyo botón **desbloquea el acceso**: hasta que se toca, la
   * cuenta existe pero no puede entrar. Por eso dice qué pasa si no se hace
   * nada, en vez de dejar a alguien esperando frente a un login que lo rechaza
   * sin explicar por qué.
   */
  async sendVerificacionEmail(
    to: string,
    datos: { token: string; nombre?: string; horas: number },
  ) {
    const link = `${process.env.FRONT_URL}/auth/verify-email?token=${datos.token}`;

    await this.despachar({
      to,
      subject: 'Confirmá tu correo | FleetLog',
      html: this.plantilla({
        titulo: 'Confirmá tu correo para empezar',
        color: '#0b57d0',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            ${datos.nombre ? `Hola ${datos.nombre}: ` : ''}tu cuenta de FleetLog
            ya está creada. Falta un solo paso.
          </p>
          <p style="font-size: 14px; color: #555;">
            Confirmá que esta casilla es tuya y entrás directo a tu prueba
            gratuita. <strong>Hasta que lo hagas no vas a poder iniciar
            sesión.</strong>
          </p>`,
        cta: { texto: 'Confirmar mi correo', url: link },
      }),
    });
  }

  /**
   * Invitación a sumarse a una empresa ya existente.
   *
   * El asunto nombra a la empresa y no a FleetLog: quien lo recibe conoce a su
   * empleador, no necesariamente al proveedor de software, y un asunto que sólo
   * dice "FleetLog" se lee como publicidad y se borra.
   */
  async sendInvitacion(
    to: string,
    datos: {
      token: string;
      empresa: string;
      rol: string;
      invitadoPor?: string;
      expiresAt: Date;
    },
  ) {
    const link = `${process.env.FRONT_URL}/invite/${datos.token}`;

    await this.despachar({
      to,
      subject: `${datos.empresa} te invitó a FleetLog`,
      html: this.plantilla({
        titulo: `Te sumaron a ${datos.empresa}`,
        color: '#0b57d0',
        cuerpo: `
          <p style="font-size: 16px; color: #333;">
            ${datos.invitadoPor ? `${datos.invitadoPor} te` : 'Te'} invitó a
            usar FleetLog con <strong>${datos.empresa}</strong>, con el perfil
            de <strong>${datos.rol}</strong>.
          </p>
          <p style="font-size: 14px; color: #555;">
            Al aceptar elegís tu contraseña y entrás. El enlace vence el
            <strong>${this.fecha(datos.expiresAt)}</strong>.
          </p>`,
        cta: { texto: 'Aceptar la invitación', url: link },
      }),
    });
  }
}
