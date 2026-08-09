import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SequenceKey } from '../entities/company-sequence.entity';

/**
 * Emisor de números correlativos por empresa.
 *
 * Reemplaza al `repository.count()` que usaban `TripsService` e
 * `IncidentsService`, que tenía dos problemas:
 *
 *   1. Contaba TODAS las filas de la tabla. Con multi-empresa, la numeración de
 *      una empresa habría dependido de cuántos registros cargaron las demás.
 *   2. Repetía códigos. Dos altas simultáneas leían el mismo total y generaban
 *      el mismo código; y como el proyecto usa borrado lógico, al dar de baja un
 *      registro el contador retrocedía y volvía a emitir un código ya usado.
 *
 * Acá el correlativo se guarda, nunca se recalcula, y el `FOR UPDATE` serializa
 * a dos altas simultáneas de la misma empresa.
 */
@Injectable()
export class SequencesService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Devuelve el próximo número de la secuencia y lo consume.
   *
   * @param manager Opcional: si el llamador ya está dentro de una transacción,
   *   pasarla hace que el consumo del número forme parte de la misma unidad de
   *   trabajo, y que se deshaga junto con ella si el alta falla.
   */
  async next(
    companyId: string,
    key: SequenceKey,
    manager?: EntityManager,
  ): Promise<number> {
    const run = async (em: EntityManager): Promise<number> => {
      // Asegura la fila sin romper si otra transacción la creó primero.
      await em.query(
        'INSERT IGNORE INTO `company_sequences` (`id`, `companyId`, `key`, `lastValue`) VALUES (UUID(), ?, ?, 0)',
        [companyId, key],
      );

      // FOR UPDATE: bloquea la fila hasta el commit, así dos altas simultáneas
      // de la misma empresa no pueden leer el mismo `lastValue`.
      const rows = await em.query(
        'SELECT `id`, `lastValue` FROM `company_sequences` WHERE `companyId` = ? AND `key` = ? FOR UPDATE',
        [companyId, key],
      );

      const next = Number(rows[0].lastValue) + 1;
      await em.query(
        'UPDATE `company_sequences` SET `lastValue` = ? WHERE `id` = ?',
        [next, rows[0].id],
      );

      return next;
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Próximo código formateado, con el prefijo y el relleno que ya usaba el
   * sistema (`V-00001`, `INC-00001`).
   */
  async nextCode(
    companyId: string,
    key: SequenceKey,
    prefix: string,
    manager?: EntityManager,
  ): Promise<string> {
    const value = await this.next(companyId, key, manager);
    return `${prefix}${value.toString().padStart(5, '0')}`;
  }
}
