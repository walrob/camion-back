import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contador de almacenamiento por empresa (fase 4 del plan SaaS).
 *
 * Se siembra con la suma real de los adjuntos existentes para que el límite
 * arranque midiendo bien desde el primer día.
 */
export class StorageCounter1786260000000 implements MigrationInterface {
  name = 'StorageCounter1786260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `companies` ADD `storageBytesUsed` bigint NOT NULL DEFAULT 0',
    );

    // Semilla: lo ya cargado. Los adjuntos borrados lógicamente no cuentan,
    // porque tampoco ocupan lugar una vez que se limpian de S3.
    await queryRunner.query(
      'UPDATE `companies` c SET `storageBytesUsed` = COALESCE((' +
        'SELECT SUM(a.`sizeBytes`) FROM `attachments` a ' +
        'WHERE a.`companyId` = c.`id` AND a.`deletedAt` IS NULL' +
        '), 0)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `storageBytesUsed`',
    );
  }
}
