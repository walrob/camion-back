import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La planilla pre-viaje deja de ser una lista de SI/NO.
 *
 * Sale de relevar el formulario RIP 06 09 01 de un cliente que opera bajo OEA
 * y compararlo con lo que el sistema sabía representar. Lo que faltaba no eran
 * ítems —eso ya era configurable— sino cuatro cosas de fondo:
 *
 * 1. **Quién libera la unidad.** La firma del chofer cierra su declaración, no
 *    la aprueba. Aparece `pending_validation` y las columnas de quién validó,
 *    cuándo y con qué observación. Sin esto no se puede representar «requiere
 *    validación de Tráfico», que es literalmente lo que dice la planilla.
 *
 * 2. **Qué clase de punto es cada uno.** Una declaración que se acepta, una
 *    foto que se pide siempre y una pregunta en negativo —«¿tiene pérdidas?»,
 *    donde el SÍ es la respuesta mala— no son la misma cosa. De ahí `type`,
 *    `expectedAnswer` y el `answer` crudo del chofer, que se guarda además del
 *    `status` derivado.
 *
 * 3. **Los acompañantes.** Tabla propia: la planilla admite más de uno y de
 *    cada uno hay que poder decir si se pidió el seguro. Si la persona ya está
 *    en el sistema —un chofer que viaja de acompañante de otro— se guarda su
 *    `employeeId`: el nombre y el documento salen del legajo y no hace falta
 *    volver a adjuntar el DNI, que ya está en el centro documental.
 *
 * 4. **Qué formulario se firmó.** `code` + `revision` en la plantilla, copiados
 *    a cada checklist emitido. Una auditoría no pregunta por «el checklist»,
 *    pregunta por el RIP 06 09 01 REV.04.
 *
 * Nada de esto cambia el comportamiento de una empresa que no toque su
 * configuración: los ajustes nuevos nacen apagados y los defaults de las
 * columnas reproducen lo que el sistema hacía hasta hoy.
 */
export class ChecklistRip1788100000000 implements MigrationInterface {
  name = 'ChecklistRip1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Identidad documental de la plantilla ───
    await queryRunner.query(
      'ALTER TABLE `checklist_templates` ADD `code` varchar(40) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_templates` ADD `revision` varchar(20) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_templates` ADD `revisionDate` date NULL',
    );

    // ─── Puntos de la plantilla ───
    for (const tabla of ['checklist_template_items', 'checklist_items']) {
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`section\` varchar(120) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`helpText\` text NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`type\` enum ('condition', 'ack', 'photo', 'text') NOT NULL DEFAULT 'condition'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`expectedAnswer\` enum ('yes', 'no', 'na') NOT NULL DEFAULT 'yes'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`requiresPhoto\` tinyint NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`minPhotos\` int NOT NULL DEFAULT 1`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`maxPhotos\` int NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` ADD \`requiresValidationOnFail\` tinyint NOT NULL DEFAULT 0`,
      );
    }

    // La respuesta cruda del chofer. Nullable a propósito: los ítems ya
    // emitidos tienen `status` pero nunca tuvieron respuesta que guardar, y
    // rellenarlos hacia atrás sería inventar lo que el chofer contestó.
    await queryRunner.query(
      "ALTER TABLE `checklist_items` ADD `answer` enum ('yes', 'no', 'na') NULL",
    );

    // ─── Cabecera de la planilla ───
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `trailerId` varchar(255) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `templateId` varchar(255) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `templateCode` varchar(40) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `templateRevision` varchar(20) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `hasCompanion` tinyint NULL',
    );
    await queryRunner.query('ALTER TABLE `checklists` ADD `notes` text NULL');
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `lat` decimal(10,6) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `lng` decimal(10,6) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `validatedBy` varchar(255) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `validatedAt` timestamp NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `validationNotes` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD `clientId` varchar(255) NULL',
    );

    // MySQL admite varios NULL bajo una única: las planillas viejas, sin
    // `clientId`, no chocan entre sí.
    await queryRunner.query(
      'ALTER TABLE `checklists` ADD UNIQUE INDEX `UQ_checklists_company_client` (`companyId`, `clientId`)',
    );

    // El estado que faltaba: firmado, pero sin liberar.
    await queryRunner.query(
      "ALTER TABLE `checklists` CHANGE `result` `result` enum ('pending', 'pending_validation', 'approved', 'rejected') NOT NULL DEFAULT 'pending'",
    );

    // ─── Acompañantes ───
    await queryRunner.query(
      'CREATE TABLE `checklist_companions` (' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`checklistId` varchar(255) NOT NULL, ' +
        '`employeeId` varchar(255) NULL, ' +
        '`idDocumentOnFile` tinyint NOT NULL DEFAULT 0, ' +
        '`fullName` varchar(255) NOT NULL, ' +
        '`document` varchar(40) NULL, ' +
        '`relationship` varchar(60) NULL, ' +
        '`insuranceRequested` tinyint NOT NULL DEFAULT 0, ' +
        '`authorizedBy` varchar(255) NULL, ' +
        '`authorizedAt` timestamp NULL, ' +
        '`notes` text NULL, ' +
        'INDEX `IDX_checklist_companions_company` (`companyId`), ' +
        'INDEX `IDX_checklist_companions_checklist` (`checklistId`), ' +
        'INDEX `IDX_checklist_companions_employee` (`employeeId`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_companions` ADD CONSTRAINT `FK_checklist_companions_company` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_companions` ADD CONSTRAINT `FK_checklist_companions_checklist` ' +
        'FOREIGN KEY (`checklistId`) REFERENCES `checklists`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );

    // ─── Clasificación de ruta del viaje ───
    // Clave del catálogo `trip_classification`, no un enum: las rutas de una
    // empresa no son las de otra («Ida Brasil» existe para una y no para otra),
    // y agregar la suya no puede requerir una migración.
    await queryRunner.query(
      'ALTER TABLE `trips` ADD `classification` varchar(64) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `trips` DROP COLUMN `classification`');

    await queryRunner.query(
      'ALTER TABLE `checklist_companions` DROP FOREIGN KEY `FK_checklist_companions_checklist`',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_companions` DROP FOREIGN KEY `FK_checklist_companions_company`',
    );
    await queryRunner.query('DROP TABLE `checklist_companions`');

    // Las que esperaban validación no tienen equivalente en el enum viejo. Se
    // las deja como pendientes y no como aprobadas: al revertir, una unidad sin
    // liberar no puede pasar a estar liberada.
    await queryRunner.query(
      "UPDATE `checklists` SET `result` = 'pending' WHERE `result` = 'pending_validation'",
    );
    await queryRunner.query(
      "ALTER TABLE `checklists` CHANGE `result` `result` enum ('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'",
    );

    await queryRunner.query(
      'ALTER TABLE `checklists` DROP INDEX `UQ_checklists_company_client`',
    );
    for (const columna of [
      'clientId',
      'validationNotes',
      'validatedAt',
      'validatedBy',
      'lng',
      'lat',
      'notes',
      'hasCompanion',
      'templateRevision',
      'templateCode',
      'templateId',
      'trailerId',
    ]) {
      await queryRunner.query(
        `ALTER TABLE \`checklists\` DROP COLUMN \`${columna}\``,
      );
    }

    await queryRunner.query(
      'ALTER TABLE `checklist_items` DROP COLUMN `answer`',
    );

    for (const tabla of ['checklist_template_items', 'checklist_items']) {
      for (const columna of [
        'requiresValidationOnFail',
        'maxPhotos',
        'minPhotos',
        'requiresPhoto',
        'expectedAnswer',
        'type',
        'helpText',
        'section',
      ]) {
        await queryRunner.query(
          `ALTER TABLE \`${tabla}\` DROP COLUMN \`${columna}\``,
        );
      }
    }

    await queryRunner.query(
      'ALTER TABLE `checklist_templates` DROP COLUMN `revisionDate`',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_templates` DROP COLUMN `revision`',
    );
    await queryRunner.query(
      'ALTER TABLE `checklist_templates` DROP COLUMN `code`',
    );
  }
}
