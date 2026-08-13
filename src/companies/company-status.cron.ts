import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/**
 * Días de gracia entre que vence el trial y el bloqueo efectivo.
 *
 * No se bloquea el mismo día: alguien que probó tres semanas y está por comprar
 * merece un margen, y una cuenta bloqueada de golpe es una venta perdida.
 */
const DIAS_DE_GRACIA = 3;

/**
 * Transiciones automáticas del estado comercial de las empresas.
 *
 * Corre sin request, así que abre contexto de sistema de forma explícita: la
 * consulta es transversal a todas las empresas y el filtrado por empresa no
 * tendría con qué filtrar.
 */
@Injectable()
export class CompanyStatusCron {
  private readonly logger = new Logger(CompanyStatusCron.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async revisarTrials(): Promise<void> {
    const bloqueadas = await this.vencerTrials();
    if (bloqueadas) {
      this.logger.log(`Trials vencidos: ${bloqueadas} cuenta(s) suspendida(s).`);
    }
  }

  /**
   * Pasa a `BLOCKED` los trials vencidos hace más de los días de gracia.
   *
   * `BLOCKED` es **sólo lectura**, no un corte total (decisión D6): el cliente
   * sigue viendo sus datos y puede pagar. Bloquear del todo destruye la relación
   * comercial justo cuando todavía se puede recuperar.
   *
   * Separado del `@Cron` para poder dispararlo a mano y para poder testearlo.
   */
  async vencerTrials(ahora = new Date()): Promise<number> {
    const corte = new Date(ahora);
    corte.setDate(corte.getDate() - DIAS_DE_GRACIA);

    return runAsSystem(async () => {
      const vencidas = await this.companiesRepository.find({
        where: {
          status: In([CompanyStatus.TRIAL]),
          trialEndsAt: LessThan(corte),
          // La empresa plataforma no es un cliente: no tiene trial que vencer.
          isPlatform: false,
        },
      });

      for (const company of vencidas) {
        company.status = CompanyStatus.BLOCKED;
        await this.companiesRepository.save(company);
        this.logger.warn(
          `Trial vencido sin pago: ${company.name} (${company.id}) pasa a solo lectura.`,
        );
      }

      return vencidas.length;
    });
  }
}
