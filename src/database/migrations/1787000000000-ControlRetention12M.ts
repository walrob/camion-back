import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sube el histórico visible del plan Control de 6 a 12 meses.
 *
 * `SeedPlans` ya quedó corregida para las instalaciones nuevas; esta migración
 * es para las bases que ya la ejecutaron.
 *
 * Igual que en `ControlStorage2Gb`: se lee el JSON, se cambia la clave y se
 * vuelve a guardar, para no pisar el resto de los límites del plan.
 */
export class ControlRetention12M1787000000000 implements MigrationInterface {
  name = 'ControlRetention12M1787000000000';

  private async cambiarRetencion(
    queryRunner: QueryRunner,
    meses: number,
  ): Promise<void> {
    const filas = (await queryRunner.query(
      "SELECT `id`, `limits` FROM `plans` WHERE `code` = 'control'",
    )) as { id: string; limits: string | null }[];

    for (const fila of filas) {
      if (!fila.limits) continue;
      const limits = JSON.parse(fila.limits) as Record<string, unknown>;
      limits.retentionMonths = meses;
      await queryRunner.query(
        'UPDATE `plans` SET `limits` = ? WHERE `id` = ?',
        [JSON.stringify(limits), fila.id],
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.cambiarRetencion(queryRunner, 12);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.cambiarRetencion(queryRunner, 6);
  }
}
