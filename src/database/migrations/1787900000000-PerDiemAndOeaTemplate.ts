import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cierre de los tres pendientes de docs/CONFIGURACION.md:
 *
 * 1. **Viático de monto fijo** (§6.4): el viaje puede llevar su propio importe,
 *    con su moneda —un viaje a Asunción puede pagarse en dólares aunque la
 *    empresa facture en pesos—. Nace en `null`: con el ajuste
 *    `settlement.perDiemMode` en su valor por defecto (`log`), nada cambia.
 *
 * 2. **Plantilla OEA propia** (§6.2): la empresa suma sus puntos a los 7 de la
 *    norma AFIP, que siguen siendo constantes del código y no se editan. Para
 *    eso `oea_inspection_items.key` deja de ser `enum` —el mismo desbloqueo del
 *    checklist y los catálogos— y `section` también.
 *
 * 3. `locale.locale` no necesita migración: es un ajuste más en
 *    `company_settings`, que ya existe.
 */
export class PerDiemAndOeaTemplate1787900000000 implements MigrationInterface {
  name = 'PerDiemAndOeaTemplate1787900000000';

  private static readonly CLAVES_OEA = [
    'front_wall',
    'side_walls',
    'floor',
    'ceiling',
    'doors',
    'front_exterior',
    'chassis',
    'customs_seal',
    'security_seal',
    'locks',
    'tarps',
  ];

  private static readonly SECCIONES_OEA = ['physical', 'security_devices'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Viático de monto fijo ──────────────────────────────────────────────
    await queryRunner.query(
      'ALTER TABLE `trips` ADD `perDiemAmount` decimal(12,2) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `trips` ADD `perDiemCurrency` varchar(3) NULL',
    );

    // ── Plantilla OEA ──────────────────────────────────────────────────────
    await queryRunner.query(
      'CREATE TABLE `oea_template_items` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`updatedBy` varchar(255) NULL, ' +
        '`key` varchar(64) NOT NULL, ' +
        '`label` varchar(255) NOT NULL, ' +
        '`section` varchar(40) NOT NULL, ' +
        '`order` int NOT NULL DEFAULT 0, ' +
        '`isActive` tinyint NOT NULL DEFAULT 1, ' +
        'INDEX `IDX_oea_template_items_company` (`companyId`), ' +
        'UNIQUE INDEX `UQ_oea_template_items_company_key` (`companyId`, `key`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `oea_template_items` ADD CONSTRAINT `FK_oea_template_items_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );

    await queryRunner.query(
      'ALTER TABLE `oea_inspection_items` MODIFY `key` varchar(64) NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `oea_inspection_items` MODIFY `section` varchar(40) NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los puntos propios no entran en el enum de la norma: se borran de las
    // planillas para poder revertir el tipo de la columna.
    const claves = PerDiemAndOeaTemplate1787900000000.CLAVES_OEA;
    const placeholders = claves.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`oea_inspection_items\` WHERE \`key\` NOT IN (${placeholders})`,
      claves,
    );

    const literales = claves.map((c) => `'${c}'`).join(', ');
    await queryRunner.query(
      `ALTER TABLE \`oea_inspection_items\` MODIFY \`key\` enum(${literales}) NOT NULL`,
    );
    const secciones = PerDiemAndOeaTemplate1787900000000.SECCIONES_OEA
      .map((s) => `'${s}'`)
      .join(', ');
    await queryRunner.query(
      `ALTER TABLE \`oea_inspection_items\` MODIFY \`section\` enum(${secciones}) NOT NULL`,
    );

    await queryRunner.query(
      'ALTER TABLE `oea_template_items` DROP FOREIGN KEY `FK_oea_template_items_company`',
    );
    await queryRunner.query('DROP TABLE `oea_template_items`');

    await queryRunner.query('ALTER TABLE `trips` DROP COLUMN `perDiemCurrency`');
    await queryRunner.query('ALTER TABLE `trips` DROP COLUMN `perDiemAmount`');
  }
}
