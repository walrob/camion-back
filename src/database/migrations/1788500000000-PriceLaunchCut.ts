import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baja de lanzamiento: abono base y precio por vehículo ~10 % por debajo de la
 * lista de `MODELO-COMERCIAL.md` §3.2.
 *
 * Es una decisión comercial para captar las primeras cuentas. La recuperación
 * se hace después, en las revisiones trimestrales por inflación (§7.5), con un
 * ajuste algo por encima del IPC. La implementación no se toca.
 *
 * Se escriben valores absolutos, no un porcentaje: así `down` restaura
 * exactamente la lista anterior. Si un plan se editó a mano desde el
 * superadmin, esta migración pisa ese valor.
 */
export class PriceLaunchCut1788500000000 implements MigrationInterface {
  name = 'PriceLaunchCut1788500000000';

  /** [code, baseFee, pricePerVehicle] — lista nueva. */
  private static readonly NUEVOS: [string, number, number][] = [
    ['control', 52900, 7100],
    ['operacion', 115900, 11600],
    ['gestion', 223900, 16900],
    ['corporate', 440000, 9800],
  ];

  /** [code, baseFee, pricePerVehicle] — lista anterior. */
  private static readonly ANTERIORES: [string, number, number][] = [
    ['control', 59000, 7900],
    ['operacion', 129000, 12900],
    ['gestion', 249000, 18900],
    ['corporate', 490000, 10900],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.aplicar(queryRunner, PriceLaunchCut1788500000000.NUEVOS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.aplicar(queryRunner, PriceLaunchCut1788500000000.ANTERIORES);
  }

  private async aplicar(
    queryRunner: QueryRunner,
    precios: [string, number, number][],
  ): Promise<void> {
    for (const [code, baseFee, pricePerVehicle] of precios) {
      await queryRunner.query(
        'UPDATE `plans` SET `baseFee` = ?, `pricePerVehicle` = ? WHERE `code` = ?',
        [baseFee, pricePerVehicle, code],
      );
    }
  }
}
