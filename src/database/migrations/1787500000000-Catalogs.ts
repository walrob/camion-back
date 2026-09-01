import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogos de negocio por empresa (fase C de docs/CONFIGURACION.md).
 *
 * 1. `catalog_items`: nace vacía. Mientras la empresa no edite un catálogo, se
 *    usan los elementos de sistema definidos en `catalogs.catalog.ts`.
 *
 * 2. `trip_log_entries.type` e `incidents.type` dejan de ser `enum` y pasan a
 *    `varchar`. Es el mismo desbloqueo que necesitó el checklist: una empresa
 *    que agrega «Balanza» a sus tipos de gasto no puede requerir una migración.
 *    Los valores actuales entran tal cual, así que no hay conversión de datos.
 *
 * 3. La feature `catalogs` se suma a los planes desde Operación: configurar es
 *    una capacidad del producto y respeta la matriz comercial.
 *
 * El `down` borra las filas con claves que el enum no conoce —las que haya
 * creado el cliente— porque es la única forma de que MySQL acepte volver atrás.
 */
export class Catalogs1787500000000 implements MigrationInterface {
  name = 'Catalogs1787500000000';

  private static readonly TIPOS_DE_GASTO = [
    'fuel',
    'toll',
    'expense',
    'cash_advance',
    'repair',
    'fine',
    'per_diem',
    'other',
  ];

  private static readonly TIPOS_DE_INCIDENTE = [
    'mechanical',
    'accident',
    'cash_shortage',
    'delay',
    'cargo_issue',
    'client_issue',
    'emergency',
  ];

  private static readonly PLANES_CON_CATALOGOS = [
    'operacion',
    'gestion',
    'corporate',
    'legacy',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `catalog_items` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`updatedBy` varchar(255) NULL, ' +
        '`catalog` varchar(40) NOT NULL, ' +
        '`key` varchar(64) NOT NULL, ' +
        '`label` varchar(255) NOT NULL, ' +
        '`color` varchar(40) NULL, ' +
        '`icon` varchar(60) NULL, ' +
        '`order` int NOT NULL DEFAULT 0, ' +
        '`behavior` varchar(30) NULL, ' +
        '`isActive` tinyint NOT NULL DEFAULT 1, ' +
        'INDEX `IDX_catalog_items_company` (`companyId`), ' +
        'UNIQUE INDEX `UQ_catalog_items_company_catalog_key` (`companyId`, `catalog`, `key`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );

    await queryRunner.query(
      'ALTER TABLE `catalog_items` ADD CONSTRAINT `FK_catalog_items_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );

    await queryRunner.query(
      'ALTER TABLE `trip_log_entries` MODIFY `type` varchar(64) NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `incidents` MODIFY `type` varchar(64) NOT NULL',
    );

    await this.cambiarFeature(queryRunner, (features) => [
      ...new Set([...features, 'catalogs']),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.cambiarFeature(queryRunner, (features) =>
      features.filter((f) => f !== 'catalogs'),
    );

    await this.volverAEnum(
      queryRunner,
      'trip_log_entries',
      Catalogs1787500000000.TIPOS_DE_GASTO,
    );
    await this.volverAEnum(
      queryRunner,
      'incidents',
      Catalogs1787500000000.TIPOS_DE_INCIDENTE,
    );

    await queryRunner.query(
      'ALTER TABLE `catalog_items` DROP FOREIGN KEY `FK_catalog_items_company`',
    );
    await queryRunner.query('DROP TABLE `catalog_items`');
  }

  private async volverAEnum(
    queryRunner: QueryRunner,
    tabla: string,
    claves: string[],
  ): Promise<void> {
    const placeholders = claves.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`${tabla}\` WHERE \`type\` NOT IN (${placeholders})`,
      claves,
    );
    // El tipo de una columna no admite parámetros: van literales. Son
    // constantes del código, no entrada de usuario.
    const literales = claves.map((c) => `'${c}'`).join(', ');
    await queryRunner.query(
      `ALTER TABLE \`${tabla}\` MODIFY \`type\` enum(${literales}) NOT NULL`,
    );
  }

  private async cambiarFeature(
    queryRunner: QueryRunner,
    cambiar: (features: string[]) => string[],
  ): Promise<void> {
    for (const code of Catalogs1787500000000.PLANES_CON_CATALOGOS) {
      const filas: { id: string; features: string | null }[] =
        await queryRunner.query(
          'SELECT `id`, `features` FROM `plans` WHERE `code` = ?',
          [code],
        );
      for (const fila of filas) {
        let actuales: string[] = [];
        try {
          actuales = fila.features ? JSON.parse(fila.features) : [];
        } catch {
          continue;
        }
        await queryRunner.query('UPDATE `plans` SET `features` = ? WHERE `id` = ?', [
          JSON.stringify(cambiar(actuales)),
          fila.id,
        ]);
      }
    }
  }
}
