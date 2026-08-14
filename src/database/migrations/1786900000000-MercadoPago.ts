import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 9: cobro automático por Mercado Pago y ciclo de mora.
 *
 * Tres cosas, en este orden:
 *
 *  1. Las columnas del débito automático en `companies` y del pago de MP en
 *     `payments`.
 *  2. `mp_webhook_events`, que es el candado de idempotencia de los avisos
 *     (R9.2): sin el índice único, dos copias simultáneas del mismo aviso
 *     acreditan dos veces.
 *  3. La unicidad del período facturable en la base (R9.1). Es la que impide
 *     que dos corridas del cron —o el cron y una emisión manual a la vez—
 *     facturen dos veces el mismo mes.
 */
export class MercadoPago1786900000000 implements MigrationInterface {
  name = 'MercadoPago1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Débito automático de la empresa ────────────────────────────────
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `mpPreapprovalId` varchar(64) NULL DEFAULT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `mpPreapprovalStatus` enum ('authorized', 'pending', 'paused', 'cancelled') NULL DEFAULT NULL",
    );
    await queryRunner.query(
      'ALTER TABLE `companies` ADD `mpPayerEmail` varchar(255) NULL DEFAULT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `companies` ADD `defaultedAt` timestamp NULL DEFAULT NULL',
    );

    // ── 2. Pago acreditado por MP ─────────────────────────────────────────
    await queryRunner.query(
      'ALTER TABLE `payments` ADD `mpPaymentId` varchar(64) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `payments` ADD `mpPreapprovalId` varchar(64) NULL',
    );
    await queryRunner.query(
      "ALTER TABLE `payments` ADD `status` enum ('paid', 'pending', 'rejected', 'refunded', 'canceled') NOT NULL DEFAULT 'paid'",
    );
    // Único: es lo que hace que un aviso repetido de MP no acredite dos veces.
    // MySQL admite varios NULL, así que los pagos manuales no estorban.
    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_payments_mpPaymentId` ON `payments` (`mpPaymentId`)',
    );

    // ── 3. Avisos de MP ───────────────────────────────────────────────────
    await queryRunner.query(
      'CREATE TABLE `mp_webhook_events` (' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`type` varchar(64) NOT NULL, ' +
        '`resourceId` varchar(64) NOT NULL, ' +
        '`processedAt` timestamp NULL DEFAULT NULL, ' +
        '`error` varchar(500) NULL, ' +
        '`companyId` varchar(36) NULL, ' +
        'UNIQUE INDEX `UQ_mp_webhook_events_type_resource` (`type`, `resourceId`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );

    // ── 4. Un período, una sola factura (R9.1) ────────────────────────────
    //
    // La columna la calcula la base: vale `periodStart` sólo si la fila es un
    // período normal, vigente y no anulado. Para los prorrateos vale NULL, y
    // como MySQL permite repetir NULL en un índice único, una empresa puede
    // tener varios cargos prorrateados el mismo día (un upgrade y un add-on
    // son dos cargos legítimos) sin que se rompa la unicidad del período.
    await queryRunner.query(
      'ALTER TABLE `subscriptions` ADD `periodKey` date ' +
        "GENERATED ALWAYS AS (case when `isProrated` = 0 and `deletedAt` is null and `status` <> 'void' then `periodStart` else null end) STORED",
    );

    // Si quedaron duplicados de antes de esta migración, el índice no se puede
    // crear. Se avisa con el detalle en vez de fallar con un error de MySQL
    // que no dice qué empresa hay que revisar.
    const duplicados: { companyId: string; periodStart: string; n: number }[] =
      await queryRunner.query(
        'SELECT `companyId`, `periodStart`, COUNT(*) AS n FROM `subscriptions` ' +
          'WHERE `periodKey` IS NOT NULL GROUP BY `companyId`, `periodStart` HAVING n > 1',
      );

    if (duplicados.length) {
      throw new Error(
        'No se puede aplicar la unicidad de período: hay períodos facturados ' +
          'dos veces. Anulá (status = void) el sobrante y volvé a correr la ' +
          'migración. Casos: ' +
          duplicados
            .map((d) => `${d.companyId} ${String(d.periodStart).slice(0, 10)}`)
            .join(', '),
      );
    }

    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_subscriptions_period` ON `subscriptions` (`companyId`, `periodKey`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `UQ_subscriptions_period` ON `subscriptions`',
    );
    await queryRunner.query(
      'ALTER TABLE `subscriptions` DROP COLUMN `periodKey`',
    );

    await queryRunner.query('DROP TABLE `mp_webhook_events`');

    await queryRunner.query(
      'DROP INDEX `UQ_payments_mpPaymentId` ON `payments`',
    );
    await queryRunner.query('ALTER TABLE `payments` DROP COLUMN `status`');
    await queryRunner.query(
      'ALTER TABLE `payments` DROP COLUMN `mpPreapprovalId`',
    );
    await queryRunner.query('ALTER TABLE `payments` DROP COLUMN `mpPaymentId`');

    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `defaultedAt`',
    );
    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `mpPayerEmail`',
    );
    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `mpPreapprovalStatus`',
    );
    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `mpPreapprovalId`',
    );
  }
}
