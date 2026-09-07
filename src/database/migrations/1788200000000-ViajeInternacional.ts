import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La mitad del viaje internacional que faltaba del lado del backend
 * (docs/CONFIGURACION.md §7.6 y §14).
 *
 * El formulario, la propagación de la moneda a la bitácora y el armado del
 * payload ya estaban construidos en el front: mandaba `destinationCountry` y
 * `currency` en cada alta de viaje y el DTO los descartaba en silencio, así que
 * la función nunca funcionaba de punta a punta. El ajuste `trip.international`
 * tampoco existía en el catálogo, y como el front lee `false` ante un ajuste
 * ausente, los campos directamente no se mostraban nunca.
 *
 * Acá van las dos columnas. El ajuste no necesita migración: vive en
 * `settings.catalog.ts` y sólo se guarda fila cuando una empresa lo cambia.
 *
 * `destinationCountry` es `char(2)` —ISO 3166-1 alfa-2— y no una FK a una tabla
 * de países: la lista de destinos vive en el front y es una constante del
 * código, no vocabulario propio de ninguna empresa.
 */
export class ViajeInternacional1788200000000 implements MigrationInterface {
  name = 'ViajeInternacional1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `trips` ADD `destinationCountry` char(2) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `trips` ADD `currency` varchar(3) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `trips` DROP COLUMN `currency`');
    await queryRunner.query(
      'ALTER TABLE `trips` DROP COLUMN `destinationCountry`',
    );
  }
}
