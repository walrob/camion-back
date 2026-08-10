import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baja el almacenamiento incluido en el plan Control de 5 GB a 2 GB.
 *
 * `SeedPlans` ya quedó corregida para las instalaciones nuevas; esta migración
 * es para las bases que ya la ejecutaron.
 *
 * No se escribe el JSON completo a mano: se lee, se cambia la clave y se vuelve
 * a guardar. Así, si el plan tiene otros límites (o se le agregan más adelante),
 * no se pisan.
 */
export class ControlStorage2Gb1786270000000 implements MigrationInterface {
  name = 'ControlStorage2Gb1786270000000';

  private async cambiarStorage(
    queryRunner: QueryRunner,
    gb: number,
  ): Promise<void> {
    const filas = (await queryRunner.query(
      "SELECT `id`, `limits` FROM `plans` WHERE `code` = 'control'",
    )) as { id: string; limits: string | null }[];

    for (const fila of filas) {
      if (!fila.limits) continue;
      const limits = JSON.parse(fila.limits) as Record<string, unknown>;
      limits.storageGb = gb;
      await queryRunner.query(
        'UPDATE `plans` SET `limits` = ? WHERE `id` = ?',
        [JSON.stringify(limits), fila.id],
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.cambiarStorage(queryRunner, 2);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.cambiarStorage(queryRunner, 5);
  }
}
