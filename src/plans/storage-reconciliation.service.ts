import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';

/**
 * Reconcilia el acumulado de almacenamiento contra la suma real de adjuntos.
 *
 * El contador de `Company.storageBytesUsed` es incremental porque contar todos
 * los adjuntos en cada subida no escala. Todo contador incremental se desvía:
 * subidas que fallan a mitad, borrados hechos fuera de la aplicación,
 * despliegues en el medio de una operación. Sin esta corrección nocturna el
 * desvío se acumula para siempre, y termina cobrándole de más a un cliente o
 * regalándole espacio.
 *
 * Corre para TODAS las empresas, así que va sin contexto de tenant: es una
 * consulta agregada global, no una operación de una empresa.
 */
@Injectable()
export class StorageReconciliationService {
  private readonly logger = new Logger(StorageReconciliationService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async reconciliar(): Promise<void> {
    const desvios = await this.reconciliarAhora();
    if (desvios.length) {
      this.logger.warn(
        `Almacenamiento reconciliado en ${desvios.length} empresa(s): ` +
          desvios
            .map((d) => `${d.companyId} ${d.antes} → ${d.despues}`)
            .join(' · '),
      );
    }
  }

  /**
   * Recalcula y devuelve sólo las empresas que estaban desviadas.
   * Separado del `@Cron` para poder dispararlo a mano desde el superadmin.
   */
  async reconciliarAhora(): Promise<
    { companyId: string; antes: number; despues: number }[]
  > {
    const filas: { id: string; usado: string; real: string }[] =
      await this.companiesRepository.query(
        'SELECT c.`id` AS id, c.`storageBytesUsed` AS usado, ' +
          'COALESCE((SELECT SUM(a.`sizeBytes`) FROM `attachments` a ' +
          'WHERE a.`companyId` = c.`id` AND a.`deletedAt` IS NULL), 0) AS real ' +
          'FROM `companies` c WHERE c.`deletedAt` IS NULL',
      );

    const desvios: { companyId: string; antes: number; despues: number }[] = [];

    for (const f of filas) {
      const usado = Number(f.usado);
      const real = Number(f.real);
      if (usado === real) continue;

      await this.companiesRepository.query(
        'UPDATE `companies` SET `storageBytesUsed` = ? WHERE `id` = ?',
        [real, f.id],
      );
      desvios.push({ companyId: f.id, antes: usado, despues: real });
    }

    return desvios;
  }
}
