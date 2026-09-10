import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comprobante de la suscripción: datos de facturación de la empresa y carga del
 * archivo por el superadmin.
 *
 * El sistema **no emite** la factura —no hay integración con AFIP— sino que
 * registra el cobro. El comprobante lo emite la administración por fuera y lo
 * sube acá, que es lo que el cliente después necesita bajar. Faltaban las dos
 * mitades:
 *
 * 1. **Contra qué datos se factura.** `companies` ya tenía `invoiceName`,
 *    `invoiceCuit` e `invoiceEmail`, pero con eso no alcanza para emitir una
 *    factura argentina: sin la condición frente al IVA no se sabe si va una A o
 *    una B, y sin domicilio fiscal el comprobante sale incompleto. Se agregan
 *    las dos columnas que faltaban.
 *
 * 2. **Dónde vive el archivo.** `subscriptions.invoiceUrl` existía y nadie la
 *    escribía nunca. Se renombra a `invoiceKey` porque lo que se guarda es la
 *    **key de S3**, no una URL: el archivo se sirve por endpoint propio y el
 *    bucket no es público. Un nombre que dice "url" termina tarde o temprano
 *    dentro de un `href` que da 403. Se suman el número del comprobante y
 *    cuándo se cargó, que es lo que el cliente busca cuando lo reclama.
 */
export class InvoiceUpload1788300000000 implements MigrationInterface {
  name = 'InvoiceUpload1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `companies` ADD `invoiceTaxCondition` varchar(64) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `companies` ADD `invoiceAddress` varchar(255) NULL',
    );

    // `CHANGE` y no DROP+ADD: la columna está vacía en todas las bases, pero
    // renombrar preserva el dato si alguna la llegó a escribir a mano.
    await queryRunner.query(
      'ALTER TABLE `subscriptions` CHANGE `invoiceUrl` `invoiceKey` varchar(255) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `subscriptions` ADD `invoiceNumber` varchar(64) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `subscriptions` ADD `invoiceUploadedAt` datetime(6) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `subscriptions` DROP COLUMN `invoiceUploadedAt`',
    );
    await queryRunner.query(
      'ALTER TABLE `subscriptions` DROP COLUMN `invoiceNumber`',
    );
    await queryRunner.query(
      'ALTER TABLE `subscriptions` CHANGE `invoiceKey` `invoiceUrl` varchar(255) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `invoiceAddress`',
    );
    await queryRunner.query(
      'ALTER TABLE `companies` DROP COLUMN `invoiceTaxCondition`',
    );
  }
}
