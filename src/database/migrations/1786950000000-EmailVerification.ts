import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Confirmación de la dirección de correo en el alta pública (riesgo R6.1).
 *
 * La columna se crea y **acto seguido se da por verificada a toda cuenta que ya
 * existía**. Sin ese backfill la migración dejaría afuera del sistema a todos
 * los usuarios en producción, que es un daño mucho mayor que el que la
 * verificación viene a evitar: nadie se dio de alta sin confirmar porque hasta
 * ahora no había nada que confirmar.
 */
export class EmailVerification1786950000000 implements MigrationInterface {
  name = 'EmailVerification1786950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `user` ADD `emailVerifiedAt` timestamp NULL',
    );
    await queryRunner.query(
      'UPDATE `user` SET `emailVerifiedAt` = CURRENT_TIMESTAMP',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `user` DROP COLUMN `emailVerifiedAt`',
    );
  }
}
