import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cambia a **CamioNex** los nombres de marca que quedaron guardados en la base.
 *
 * El producto se llamó FleetLog durante el desarrollo y dos migraciones
 * anteriores dejaron ese nombre escrito en filas que el usuario ve: la empresa
 * plataforma (`Superadmin`) y el add-on de IA (`Billing`).
 *
 * Se corrige con una migración nueva en vez de editar aquéllas porque las bases
 * de desarrollo ya las tienen aplicadas: cambiarles el texto no reescribe lo
 * que ya insertaron, sólo hace que una base nueva y una vieja terminen
 * distintas. Un `UPDATE` posterior deja a las dos en el mismo estado.
 *
 * Los `WHERE` van por `isPlatform` y por `code`, que son los identificadores
 * estables, y no por el nombre: si alguien ya lo renombró a mano desde el
 * panel, esta migración no le pisa el cambio.
 */
export class RebrandCamioNex1788000000000 implements MigrationInterface {
  name = 'RebrandCamioNex1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `companies` SET `name` = 'CamioNex (plataforma)', " +
        "`slug` = 'camionex-plataforma' " +
        "WHERE `isPlatform` = 1 AND `slug` = 'fleetlog-plataforma'",
    );

    await queryRunner.query(
      "UPDATE `addons` SET `name` = 'CamioNex IA' " +
        "WHERE `code` = 'ia' AND `name` = 'FleetLog IA'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `addons` SET `name` = 'FleetLog IA' " +
        "WHERE `code` = 'ia' AND `name` = 'CamioNex IA'",
    );

    await queryRunner.query(
      "UPDATE `companies` SET `name` = 'FleetLog (plataforma)', " +
        "`slug` = 'fleetlog-plataforma' " +
        "WHERE `isPlatform` = 1 AND `slug` = 'camionex-plataforma'",
    );
  }
}
