import { MigrationInterface, QueryRunner } from "typeorm";

export class Onboarding1786443969550 implements MigrationInterface {
    name = 'Onboarding1786443969550'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`invites\` (\`companyId\` varchar(36) NOT NULL, \`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`createdBy\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deletedAt\` datetime(6) NULL, \`token\` varchar(255) NOT NULL, \`email\` varchar(255) NOT NULL, \`name\` varchar(255) NULL, \`role\` enum ('admin', 'manager', 'dispatcher', 'maintenance', 'driver', 'hr', 'auditor') NOT NULL, \`expiresAt\` timestamp NOT NULL, \`acceptedAt\` timestamp NULL, \`acceptedUserId\` varchar(255) NULL, INDEX \`IDX_d812afa3118384965c84ea8406\` (\`companyId\`), UNIQUE INDEX \`IDX_18a9a6c85f7cc6f42ebef3b318\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`companies\` ADD \`onboardingStep\` int NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`invites\` ADD CONSTRAINT \`FK_d812afa3118384965c84ea84069\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`invites\` DROP FOREIGN KEY \`FK_d812afa3118384965c84ea84069\``);
        await queryRunner.query(`ALTER TABLE \`companies\` DROP COLUMN \`onboardingStep\``);
        await queryRunner.query(`DROP INDEX \`IDX_18a9a6c85f7cc6f42ebef3b318\` ON \`invites\``);
        await queryRunner.query(`DROP INDEX \`IDX_d812afa3118384965c84ea8406\` ON \`invites\``);
        await queryRunner.query(`DROP TABLE \`invites\``);
    }

}
