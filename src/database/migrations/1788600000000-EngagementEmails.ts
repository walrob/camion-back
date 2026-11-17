import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Emails automáticos de activación y re-enganche (módulo `engagement`).
 *
 * - `user.emailMarketingOptOut`: la baja de esos emails, desde el link al pie.
 * - `email_log`: un registro por email enviado. El índice único
 *   (companyId, userId, segment, step) es lo que impide mandar dos veces el
 *   mismo paso.
 */
export class EngagementEmails1788600000000 implements MigrationInterface {
  name = 'EngagementEmails1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `user` ADD `emailMarketingOptOut` tinyint NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `user` ADD `emailMarketingOptOutAt` timestamp NULL',
    );

    await queryRunner.query(
      "CREATE TABLE `email_log` (" +
        '`id` varchar(36) NOT NULL, ' +
        '`companyId` varchar(36) NOT NULL, ' +
        '`userId` varchar(36) NOT NULL, ' +
        "`segment` enum ('unverified', 'activation', 'first_trip', 'inactive') NOT NULL, " +
        '`step` int NOT NULL, ' +
        '`sentAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`clickAt` timestamp NULL, ' +
        '`targetUrl` text NOT NULL, ' +
        'INDEX `IDX_d52a2b642a5181371fe65caec7` (`companyId`), ' +
        'INDEX `IDX_d47ddde257c2b89e2d2be7d6af` (`userId`), ' +
        'INDEX `IDX_c16e9e8f57e317099923ffbb48` (`sentAt`), ' +
        'UNIQUE INDEX `IDX_0f2741a733a12fcf545a1a3880` (`companyId`, `userId`, `segment`, `step`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `email_log` ADD CONSTRAINT `FK_d52a2b642a5181371fe65caec70` ' +
        'FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ' +
        'ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `email_log` DROP FOREIGN KEY `FK_d52a2b642a5181371fe65caec70`',
    );
    await queryRunner.query('DROP TABLE `email_log`');
    await queryRunner.query(
      'ALTER TABLE `user` DROP COLUMN `emailMarketingOptOutAt`',
    );
    await queryRunner.query(
      'ALTER TABLE `user` DROP COLUMN `emailMarketingOptOut`',
    );
  }
}
