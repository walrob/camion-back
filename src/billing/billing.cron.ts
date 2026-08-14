import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { runAsCompany, runAsSystem } from 'src/common/tenant/tenant-context';
import { BillingService } from './billing.service';
import { DunningService } from './dunning.service';
import { BillingNotificationsService } from './billing-notifications.service';

/** Estados en los que una empresa sigue generando facturación. */
const FACTURABLES = [
  CompanyStatus.TRIAL,
  CompanyStatus.ACTIVE,
  CompanyStatus.DEFAULTER,
  CompanyStatus.BLOCKED,
];

/**
 * Trabajos programados de facturación.
 *
 * Todos corren **sin request**, así que abren el contexto de empresa de forma
 * explícita con `runAsCompany`: sin eso, el filtrado por empresa de la fase 2 no
 * tendría con qué filtrar y el `TenantSubscriber` rechazaría las escrituras.
 */
@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly billing: BillingService,
    private readonly dunning: DunningService,
    private readonly avisos: BillingNotificationsService,
  ) {}

  /** Empresas que hay que procesar. Se lee en contexto de sistema. */
  private empresasFacturables(): Promise<Company[]> {
    return runAsSystem(() =>
      this.companiesRepository.find({
        // La empresa plataforma es FleetLog, no un cliente: no se factura.
        where: { status: In(FACTURABLES), isPlatform: false },
      }),
    );
  }

  /**
   * Foto diaria de las unidades de cada empresa.
   *
   * Corre temprano y todos los días: es la evidencia con la que después se
   * calcula el máximo del período. Un día sin snapshot es un día que no se puede
   * defender ante un reclamo de facturación.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async snapshotDiario(): Promise<void> {
    const empresas = await this.empresasFacturables();
    let ok = 0;

    for (const empresa of empresas) {
      try {
        await runAsCompany(empresa.id, () =>
          this.billing.registrarSnapshot(empresa.id),
        );
        ok++;
      } catch (e) {
        this.logger.error(
          `Snapshot fallido para ${empresa.name} (${empresa.id}): ${String(e)}`,
        );
      }
    }

    this.logger.log(`Snapshot diario: ${ok}/${empresas.length} empresas.`);
  }

  /**
   * Emisión de períodos y aplicación de cambios diferidos.
   *
   * Orden deliberado: **primero se aplican los cambios agendados y después se
   * emite**. Al revés, un downgrade que entra en vigencia hoy se facturaría un
   * mes más al precio viejo.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async emisionDiaria(): Promise<void> {
    const aplicados = await runAsSystem(() =>
      this.billing.aplicarCambiosDiferidos(),
    );
    if (aplicados) {
      this.logger.log(`Cambios diferidos aplicados: ${aplicados}.`);
    }

    const hoy = new Date();
    const empresas = await this.empresasFacturables();
    let emitidos = 0;

    for (const empresa of empresas) {
      // Sólo el día de corte de cada empresa.
      const dia = Math.min(Math.max(empresa.billingDay ?? 1, 1), 28);
      if (hoy.getDate() !== dia) continue;

      try {
        await runAsCompany(empresa.id, async () => {
          // El período que se emite es el que ARRANCA hoy.
          const { periodStart, periodEnd } = this.billing.periodoDe(hoy, dia);
          const sub = await this.billing.emitirPeriodo(
            empresa.id,
            periodStart,
            periodEnd,
          );
          if (!sub) return;

          emitidos++;
          // El aviso va después de emitir y fuera de la transacción de la
          // emisión: un SMTP caído no puede impedir que se facture.
          await this.avisos.periodoEmitido(empresa.id, {
            periodStart: sub.periodStart,
            periodEnd: sub.periodEnd,
            amount: Number(sub.amount),
            expiration: sub.expiration,
          });
        });
      } catch (e) {
        this.logger.error(
          `Emisión fallida para ${empresa.name} (${empresa.id}): ${String(e)}`,
        );
      }
    }

    const vencidas = await runAsSystem(() => this.billing.marcarVencidas(hoy));

    this.logger.log(
      `Emisión diaria: ${emitidos} período(s) emitido(s), ${vencidas} vencido(s).`,
    );
  }

  /**
   * Ciclo de mora, una vez por día.
   *
   * El orden es el que evita cortarle el sistema a alguien sin haberle avisado:
   *
   *  1. **Avisar** a quien se le termina la prueba (7, 3 y 1 día antes).
   *  2. **Avisar** a quien vence en tres días (todavía no debe nada).
   *  3. **Marcar la mora** de quien ya venció.
   *  4. **Avisar internamente** de las cuentas que se bloquean mañana (R9.3).
   *  5. **Bloquear** a quien agotó los diez días de gracia.
   *
   * Los cinco pasos son idempotentes: correr el cron dos veces el mismo día no
   * cambia ningún estado ni duplica un aviso.
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async cobranzaDiaria(): Promise<void> {
    const hoy = new Date();

    const trials = await this.dunning.avisarTrialsPorVencer(hoy);
    const avisadas = await this.dunning.avisarVencimientosProximos(hoy);
    const enMora = await this.dunning.marcarMorosas(hoy);
    const porBloquear = await this.dunning.avisarBloqueosInminentes(hoy);
    const bloqueadas = await this.dunning.bloquearMorosas(hoy);

    if (trials || avisadas || enMora || porBloquear || bloqueadas) {
      this.logger.log(
        `Cobranza diaria: ${trials} aviso(s) de fin de prueba, ${avisadas} ` +
          `aviso(s) de vencimiento, ${enMora} nueva(s) en mora, ` +
          `${porBloquear} por bloquearse mañana, ${bloqueadas} bloqueada(s).`,
      );
    }
  }
}
