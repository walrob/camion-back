import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajustes de operación por empresa (fase A de docs/CONFIGURACION.md).
 *
 * La tabla nace **vacía y se queda vacía** hasta que alguien cambie algo: el
 * valor por defecto de cada ajuste vive en `settings.catalog.ts`, así que no hay
 * nada que sembrar. Una empresa existente sigue comportándose exactamente igual
 * después de esta migración, porque los defaults del catálogo son lo que el
 * sistema ya hacía.
 *
 * `value` es texto y no una columna por tipo: agregar un ajuste nuevo no puede
 * exigir una migración de esquema, o el módulo pierde el sentido.
 */
export class CompanySettings1787200000000 implements MigrationInterface {
  name = 'CompanySettings1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `company_settings` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`updatedBy` varchar(255) NULL, ' +
        '`key` varchar(255) NOT NULL, ' +
        '`value` text NOT NULL, ' +
        'INDEX `IDX_company_settings_company` (`companyId`), ' +
        'UNIQUE INDEX `UQ_company_settings_company_key` (`companyId`, `key`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );

    await queryRunner.query(
      'ALTER TABLE `company_settings` ADD CONSTRAINT `FK_company_settings_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ' +
        'ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `company_settings` DROP FOREIGN KEY `FK_company_settings_company`',
    );
    await queryRunner.query('DROP TABLE `company_settings`');
  }
}
