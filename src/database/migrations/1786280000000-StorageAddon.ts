import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add-on de almacenamiento adicional, en dos escalones fijos (10 GB y 50 GB).
 *
 * Permite que una empresa que llenó su espacio amplíe la capacidad **sin subir
 * de plan**: el costo de S3 depende de los GB, no de las funcionalidades, así
 * que se cubre con un cargo de capacidad y no obligando a comprar módulos.
 */
export class StorageAddon1786280000000 implements MigrationInterface {
  name = 'StorageAddon1786280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `storageAddon` enum('none','gb10','gb50') NOT NULL DEFAULT 'none'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `storageAddon`',
    );
  }
}
