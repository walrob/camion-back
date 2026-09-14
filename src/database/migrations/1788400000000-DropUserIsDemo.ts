import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Se retiran las cuentas demo de solo lectura.
 *
 * `user.isDemo` alimentaba el `DemoReadOnlyGuard`, que bloqueaba las escrituras
 * de dos cuentas compartidas (`demo.admin` / `demo.chofer`). La demostración a
 * clientes pasa a hacerse con las cuentas reales de la empresa de prueba, así
 * que el flag, el guard y el `@AllowDemo()` desaparecen del código y la
 * columna se tira con ellos: una columna que nadie lee termina, tarde o
 * temprano, con un `true` que ya no significa nada.
 *
 * Las filas con `isDemo = 1` ya fueron borradas a mano en producción. En
 * cualquier otra base se les da de baja acá (baja lógica + bloqueo, que es lo
 * que el login respeta) antes de tirar la columna, para no dejar cuentas de
 * contraseña conocida sin el guard que las contenía. No se borran físicamente
 * porque `employees.userId` las referencia sin cascade.
 */
export class DropUserIsDemo1788400000000 implements MigrationInterface {
  name = 'DropUserIsDemo1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE `user` SET `blocked` = 1, `deletedAt` = NOW(6) WHERE `isDemo` = 1',
    );
    await queryRunner.query('ALTER TABLE `user` DROP COLUMN `isDemo`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `user` ADD `isDemo` tinyint NOT NULL DEFAULT 0',
    );
  }
}
