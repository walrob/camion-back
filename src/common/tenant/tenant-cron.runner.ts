import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { runAsCompany, runAsSystem } from './tenant-context';

/**
 * Recorre las empresas abriendo el contexto de cada una, para los trabajos
 * programados del dominio.
 *
 * Un `@Cron` corre **sin request**, así que no hay contexto de empresa: las
 * consultas del servicio no tienen por dónde filtrar y el `TenantSubscriber`
 * rechaza cualquier escritura con "no hay contexto de request y tampoco se
 * indicó companyId". La única forma correcta de que un cron opere sobre datos de
 * empresa es hacer una pasada por empresa dentro de `runAsCompany`.
 *
 * `BillingCron` ya hacía esto a mano; esto es lo mismo, extraído para que los
 * crons de dominio —alertas, documentos, certificaciones, mantenimiento— no
 * tengan que repetir el bucle ni conocer al repositorio de `Company`.
 *
 * Un error en una empresa se registra y NO corta la pasada: que a un cliente le
 * falle el recálculo no puede dejar sin procesar a los demás.
 */
@Injectable()
export class TenantCronRunner {
  private readonly logger = new Logger(TenantCronRunner.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
  ) {}

  /**
   * Empresas operativas: todas menos las dadas de baja.
   *
   * Las `BLOCKED` entran a propósito: están en solo lectura para el cliente,
   * pero sus datos siguen vivos y el día que pagan tienen que encontrar los
   * estados y las alertas al día, no un agujero del tamaño del bloqueo.
   *
   * Se lee en contexto de sistema: es una consulta transversal a todas.
   */
  private empresasOperativas(): Promise<Company[]> {
    return runAsSystem(() =>
      this.companiesRepository.find({
        where: { status: Not(CompanyStatus.CANCELLED) },
      }),
    );
  }

  /**
   * Ejecuta `fn` una vez por empresa, cada una en su propio contexto.
   *
   *   @Cron(CronExpression.EVERY_DAY_AT_6AM)
   *   recalcular() {
   *     return this.cronRunner.porEmpresa('documentos', () => this.recalcularEmpresa());
   *   }
   *
   * @param tarea Nombre para el log, para saber qué falló y en qué empresa.
   */
  async porEmpresa(
    tarea: string,
    fn: (company: Company) => Promise<void>,
  ): Promise<void> {
    const empresas = await this.empresasOperativas();
    let ok = 0;

    for (const empresa of empresas) {
      try {
        await runAsCompany(empresa.id, () => fn(empresa));
        ok++;
      } catch (e) {
        this.logger.error(
          `${tarea}: falló en ${empresa.name} (${empresa.id}): ${String(e)}`,
        );
      }
    }

    if (ok < empresas.length) {
      this.logger.warn(`${tarea}: ${ok}/${empresas.length} empresas.`);
    }
  }
}
