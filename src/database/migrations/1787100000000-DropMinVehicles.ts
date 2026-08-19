import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Elimina el mínimo de vehículos facturables de los planes.
 *
 * El piso (3 / 5 / 8 / 25 camiones) obligaba a explicar en cada factura por qué
 * se cobraban unidades que la empresa no tenía, y era un control más que
 * mantener en el motor de precios, en el ABM de planes y en la landing. Se
 * factura lo que hay: la compresión por tamaño la sigue dando el abono base al
 * repartirse entre más unidades.
 *
 * Efecto sobre lo facturado: las empresas por debajo del piso pasan a pagar
 * menos. Ninguna paga más. Los períodos ya emitidos no se tocan — el detalle de
 * cada factura queda guardado en su propio registro.
 *
 * El `down` repone la columna con los valores originales por plan, para que
 * revertir no deje los mínimos en cero de forma silenciosa.
 */
export class DropMinVehicles1787100000000 implements MigrationInterface {
  name = 'DropMinVehicles1787100000000';

  /** Mínimos que tenía cada plan antes de esta migración. */
  private static readonly MINIMOS: Record<string, number> = {
    control: 3,
    operacion: 5,
    gestion: 8,
    corporate: 25,
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `plans` DROP COLUMN `minVehicles`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `plans` ADD `minVehicles` int NOT NULL DEFAULT '0'",
    );

    for (const [code, minimo] of Object.entries(DropMinVehicles1787100000000.MINIMOS)) {
      await queryRunner.query(
        'UPDATE `plans` SET `minVehicles` = ? WHERE `code` = ?',
        [minimo, code],
      );
    }
  }
}
