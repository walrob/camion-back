import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-moneda para viajes internacionales (fase D de docs/CONFIGURACION.md §7).
 *
 * Las columnas `currency` ya existían con default `'ARS'` desde el diseño
 * original; lo que faltaba era **con qué cotización se convirtió** y **cuánto
 * es eso en la moneda de la empresa**. Esas dos columnas se agregan acá y se
 * **congelan** al registrar el movimiento: la rendición de marzo no puede
 * cambiar de valor en junio porque se movió el dólar.
 *
 * El backfill pone `exchangeRate = 1` y `amountBase = amount` en todo lo ya
 * cargado: hasta hoy todo estaba en la moneda base, así que la conversión es la
 * identidad y ningún total cambia después de migrar.
 *
 * `amountBase` es **nullable** a propósito: un movimiento cargado en la ruta,
 * en otra moneda y sin cotización del día, se guarda igual y queda pendiente de
 * conversión (§7.3). Bloquear al chofer en la aduana no es una opción.
 */
export class MultiCurrency1787700000000 implements MigrationInterface {
  name = 'MultiCurrency1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `company_currencies` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`updatedBy` varchar(255) NULL, ' +
        '`code` varchar(3) NOT NULL, ' +
        '`symbol` varchar(8) NOT NULL, ' +
        '`decimals` int NOT NULL DEFAULT 2, ' +
        '`isActive` tinyint NOT NULL DEFAULT 1, ' +
        'INDEX `IDX_company_currencies_company` (`companyId`), ' +
        'UNIQUE INDEX `UQ_company_currencies_company_code` (`companyId`, `code`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );

    await queryRunner.query(
      'CREATE TABLE `exchange_rates` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`createdBy` varchar(255) NULL, ' +
        '`code` varchar(3) NOT NULL, ' +
        '`date` date NOT NULL, ' +
        '`rate` decimal(18,6) NOT NULL, ' +
        "`source` varchar(20) NOT NULL DEFAULT 'manual', " +
        'INDEX `IDX_exchange_rates_company` (`companyId`), ' +
        'INDEX `IDX_exchange_rates_company_code_date` (`companyId`, `code`, `date`), ' +
        'UNIQUE INDEX `UQ_exchange_rates_company_code_date` (`companyId`, `code`, `date`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );

    await queryRunner.query(
      'ALTER TABLE `company_currencies` ADD CONSTRAINT `FK_company_currencies_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `exchange_rates` ADD CONSTRAINT `FK_exchange_rates_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );

    // ── Conversión congelada en cada movimiento con importe ────────────────
    for (const tabla of ['trip_log_entries', 'fuel_records']) {
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`exchangeRate\` decimal(18,6) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`amountBase\` decimal(12,2) NULL`,
      );
    }

    await queryRunner.query(
      'UPDATE `trip_log_entries` SET `exchangeRate` = 1, `amountBase` = `amount`',
    );
    await queryRunner.query(
      'UPDATE `fuel_records` SET `exchangeRate` = 1, `amountBase` = `totalAmount`',
    );

    // Subtotales por moneda de la rendición, para el PDF y la pantalla.
    await queryRunner.query(
      'ALTER TABLE `settlements` ADD `totalsByCurrency` text NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `settlements` DROP COLUMN `totalsByCurrency`',
    );
    for (const tabla of ['trip_log_entries', 'fuel_records']) {
      await queryRunner.query(`ALTER TABLE \`${tabla}\` DROP COLUMN \`amountBase\``);
      await queryRunner.query(`ALTER TABLE \`${tabla}\` DROP COLUMN \`exchangeRate\``);
    }
    await queryRunner.query(
      'ALTER TABLE `exchange_rates` DROP FOREIGN KEY `FK_exchange_rates_company`',
    );
    await queryRunner.query(
      'ALTER TABLE `company_currencies` DROP FOREIGN KEY `FK_company_currencies_company`',
    );
    await queryRunner.query('DROP TABLE `exchange_rates`');
    await queryRunner.query('DROP TABLE `company_currencies`');
  }
}
