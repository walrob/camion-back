import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { EmailService } from 'src/notifications/email/email.service';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/**
 * Avisos de cobranza (§9.3).
 *
 * Dos responsabilidades que no conviene repetir en cada cron:
 *
 *  1. **A quién se le escribe.** Al `invoiceEmail` de la empresa si está
 *     cargado; si no, a los administradores activos. Nunca a los choferes.
 *  2. **Que un fallo de correo no voltee la cobranza.** Si el SMTP está caído,
 *     la empresa igual tiene que pasar a mora y el pago igual tiene que
 *     acreditarse: el estado comercial no puede depender de que salga un mail.
 *     Se loguea y se sigue, igual que hace la auditoría.
 */
@Injectable()
export class BillingNotificationsService {
  private readonly logger = new Logger(BillingNotificationsService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly email: EmailService,
  ) {}

  /**
   * Destinatarios de los avisos de una empresa.
   *
   * Devuelve lista vacía si no hay a quién escribirle, y quien llama no hace
   * nada: es preferible a inventar un destinatario.
   */
  async destinatarios(companyId: string): Promise<string[]> {
    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({
        where: { id: companyId },
        select: { id: true, invoiceEmail: true },
      }),
    );

    if (company?.invoiceEmail) return [company.invoiceEmail];

    const filas: { email: string }[] = await this.companiesRepository.query(
      'SELECT `email` FROM `user` WHERE `companyId` = ? AND `role` = ? ' +
        'AND `isActive` = 1 AND `deletedAt` IS NULL',
      [companyId, 'admin'],
    );

    return filas.map((f) => f.email).filter(Boolean);
  }

  /** Emails de los superadmins, para los avisos internos. */
  async superadmins(): Promise<string[]> {
    const filas: { email: string }[] = await this.companiesRepository.query(
      "SELECT `email` FROM `user` WHERE `role` = 'superadmin' " +
        'AND `isActive` = 1 AND `deletedAt` IS NULL',
    );
    return filas.map((f) => f.email).filter(Boolean);
  }

  /**
   * Envía a todos los destinatarios de una empresa sin propagar errores.
   *
   * `enviar` recibe un destinatario por vez: un correo con quince direcciones
   * en el `to` le muestra a cada cliente la casilla de los demás.
   */
  async aLaEmpresa(
    companyId: string,
    aviso: string,
    enviar: (destinatario: string) => Promise<void>,
  ): Promise<number> {
    const destinos = await this.destinatarios(companyId);
    let enviados = 0;

    for (const destino of destinos) {
      try {
        await enviar(destino);
        enviados++;
      } catch (e) {
        this.logger.error(
          `No se pudo enviar "${aviso}" a ${destino} (empresa ${companyId}): ${String(e)}`,
        );
      }
    }

    return enviados;
  }

  async aLosSuperadmins(
    aviso: string,
    enviar: (destinatario: string) => Promise<void>,
  ): Promise<number> {
    let enviados = 0;

    for (const destino of await this.superadmins()) {
      try {
        await enviar(destino);
        enviados++;
      } catch (e) {
        this.logger.error(
          `No se pudo enviar el aviso interno "${aviso}" a ${destino}: ${String(e)}`,
        );
      }
    }

    return enviados;
  }

  // ── Avisos concretos ───────────────────────────────────────────────────

  periodoEmitido(
    companyId: string,
    datos: {
      periodStart: Date;
      periodEnd: Date;
      amount: number;
      expiration: Date;
    },
  ) {
    return this.aLaEmpresa(companyId, 'período emitido', (to) =>
      this.email.sendPeriodoEmitido(to, datos),
    );
  }

  vencimientoProximo(
    companyId: string,
    datos: { amount: number; expiration: Date; dias: number },
  ) {
    return this.aLaEmpresa(companyId, 'vencimiento próximo', (to) =>
      this.email.sendVencimientoProximo(to, datos),
    );
  }

  pagoRecibido(companyId: string, datos: { amount: number; periodStart: Date }) {
    return this.aLaEmpresa(companyId, 'pago recibido', (to) =>
      this.email.sendPagoRecibido(to, datos),
    );
  }

  cuentaEnMora(
    companyId: string,
    datos: { amount: number; diasDeGracia: number; bloqueaEl: Date },
  ) {
    return this.aLaEmpresa(companyId, 'cuenta en mora', (to) =>
      this.email.sendCuentaEnMora(to, datos),
    );
  }

  cuentaBloqueada(companyId: string, datos: { amount: number }) {
    return this.aLaEmpresa(companyId, 'cuenta bloqueada', (to) =>
      this.email.sendCuentaBloqueada(to, datos),
    );
  }

  trialPorVencer(companyId: string, datos: { dias: number; terminaEl: Date }) {
    return this.aLaEmpresa(companyId, 'trial por vencer', (to) =>
      this.email.sendTrialPorVencer(to, datos),
    );
  }

  bloqueoInminente(
    empresas: { name: string; amount: number; bloqueaEl: Date }[],
  ) {
    if (!empresas.length) return Promise.resolve(0);
    return this.aLosSuperadmins('bloqueo inminente', (to) =>
      this.email.sendAvisoBloqueoInminente(to, empresas),
    );
  }
}
