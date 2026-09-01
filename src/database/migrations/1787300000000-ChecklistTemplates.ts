import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plantillas de checklist por empresa (fase B de docs/CONFIGURACION.md).
 *
 * Tres cambios:
 *
 * 1. Dos tablas nuevas para la plantilla y sus ítems. Nacen vacías: mientras una
 *    empresa no arme la suya, el checklist se sigue creando con
 *    `DEFAULT_CHECKLIST_ITEMS`, que es lo que hacía hasta hoy.
 *
 * 2. `checklist_items.key` deja de ser un `enum` de MySQL y pasa a `varchar`.
 *    Es el cambio que habilita todo lo demás: una empresa que agrega
 *    «Cadenas de nieve» no puede necesitar una migración de esquema. Los ocho
 *    valores existentes entran tal cual en el varchar, así que no hay
 *    conversión de datos.
 *
 * 3. Los ítems ya emitidos suman `order`, `isCritical` y `requiresPhotoOnFail`.
 *    Se copian de la plantilla al crear cada checklist y quedan congelados ahí:
 *    un checklist firmado tiene que poder explicar con qué reglas se firmó,
 *    aunque la plantilla haya cambiado después.
 *
 * El `down` vuelve `key` al enum original. Si para entonces alguna empresa creó
 * ítems propios, esas filas no entran en el enum: por eso primero se borran los
 * checklists con claves desconocidas, que es la única forma de revertir sin
 * dejar la tabla en un estado que MySQL rechace.
 */
export class ChecklistTemplates1787300000000 implements MigrationInterface {
  name = 'ChecklistTemplates1787300000000';

  /** Los ocho valores del enum original. */
  private static readonly CLAVES_ORIGINALES = [
    'lights',
    'brakes',
    'tires',
    'oil',
    'fire_extinguisher',
    'documentation',
    'trailer',
    'other',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `checklist_templates` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`createdBy` varchar(255) NULL, ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`updatedBy` varchar(255) NULL, ' +
        '`deletedAt` datetime(6) NULL, ' +
        '`name` varchar(255) NOT NULL, ' +
        '`vehicleType` varchar(255) NULL, ' +
        '`isActive` tinyint NOT NULL DEFAULT 1, ' +
        'INDEX `IDX_checklist_templates_company` (`companyId`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );

    await queryRunner.query(
      'CREATE TABLE `checklist_template_items` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`templateId` varchar(255) NOT NULL, ' +
        '`key` varchar(64) NOT NULL, ' +
        '`label` varchar(255) NOT NULL, ' +
        '`order` int NOT NULL DEFAULT 0, ' +
        '`isCritical` tinyint NOT NULL DEFAULT 0, ' +
        '`requiresPhotoOnFail` tinyint NOT NULL DEFAULT 0, ' +
        '`isActive` tinyint NOT NULL DEFAULT 1, ' +
        'INDEX `IDX_checklist_template_items_company` (`companyId`), ' +
        'INDEX `IDX_checklist_template_items_template` (`templateId`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );

    await queryRunner.query(
      'ALTER TABLE `checklist_templates` ADD CONSTRAINT `FK_checklist_templates_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_template_items` ADD CONSTRAINT `FK_checklist_template_items_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_template_items` ADD CONSTRAINT `FK_checklist_template_items_template` ' +
        'FOREIGN KEY (`templateId`) REFERENCES `checklist_templates`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );

    // La clave del ítem deja de estar cerrada por esquema.
    await queryRunner.query(
      'ALTER TABLE `checklist_items` MODIFY `key` varchar(64) NOT NULL',
    );

    await queryRunner.query(
      "ALTER TABLE `checklist_items` ADD `order` int NOT NULL DEFAULT '0'",
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_items` ADD `isCritical` tinyint NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_items` ADD `requiresPhotoOnFail` tinyint NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `checklist_items` DROP COLUMN `requiresPhotoOnFail`',
    );
    await queryRunner.query('ALTER TABLE `checklist_items` DROP COLUMN `isCritical`');
    await queryRunner.query('ALTER TABLE `checklist_items` DROP COLUMN `order`');

    // Sin esto, el MODIFY de vuelta al enum falla con las claves propias que
    // haya creado algún cliente.
    const claves = ChecklistTemplates1787300000000.CLAVES_ORIGINALES;
    const placeholders = claves.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`checklist_items\` WHERE \`key\` NOT IN (${placeholders})`,
      claves,
    );
    // El tipo de una columna no admite parámetros: la lista va literal. Son
    // constantes del código, no entrada de usuario.
    const literales = claves.map((c) => `'${c}'`).join(', ');
    await queryRunner.query(
      `ALTER TABLE \`checklist_items\` MODIFY \`key\` enum(${literales}) NOT NULL`,
    );

    await queryRunner.query(
      'ALTER TABLE `checklist_template_items` DROP FOREIGN KEY `FK_checklist_template_items_template`',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_template_items` DROP FOREIGN KEY `FK_checklist_template_items_company`',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_templates` DROP FOREIGN KEY `FK_checklist_templates_company`',
    );
    await queryRunner.query('DROP TABLE `checklist_template_items`');
    await queryRunner.query('DROP TABLE `checklist_templates`');
  }
}
