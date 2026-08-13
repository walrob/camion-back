import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { runAsCompany, runAsSystem } from 'src/common/tenant/tenant-context';
import { BillingService } from './billing.service';

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
          if (sub) emitidos++;
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
}
