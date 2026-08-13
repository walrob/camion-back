import { MigrationInterface, QueryRunner } from "typeorm";

export class Superadmin1786638505704 implements MigrationInterface {
    name = 'Superadmin1786638505704'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`audit_logs\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`actorUserId\` varchar(255) NULL, \`actorEmail\` varchar(255) NULL, \`actorRole\` varchar(255) NULL, \`actorCompanyId\` varchar(255) NULL, \`companyId\` varchar(255) NULL, \`action\` varchar(255) NOT NULL, \`entityType\` varchar(255) NULL, \`entityId\` varchar(255) NULL, \`metadata\` text NULL, \`ip\` varchar(255) NULL, \`userAgent\` varchar(300) NULL, \`isImpersonation\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_5c4e592ba7096b4c6a3b41354c\` (\`actorUserId\`, \`createdAt\`), INDEX \`IDX_7a2034302daf9817dd969f0626\` (\`companyId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`companies\` ADD \`isPlatform\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`user\` CHANGE \`role\` \`role\` enum ('superadmin', 'admin', 'manager', 'dispatcher', 'maintenance', 'driver', 'hr', 'auditor') NOT NULL DEFAULT 'driver'`);
        await queryRunner.query(`ALTER TABLE \`invites\` CHANGE \`role\` \`role\` enum ('superadmin', 'admin', 'manager', 'dispatcher', 'maintenance', 'driver', 'hr', 'auditor') NOT NULL`);

        await this.sembrarSuperadmin(queryRunner);
    }

    /** Identificador fijo de la empresa que representa a FleetLog. */
    private readonly PLATAFORMA_ID = '00000000-0000-4000-8000-0000000000f0';

    /**
     * Empresa "plataforma" y usuario superadmin.
     *
     * El superadmin necesita pertenecer a una empresa para que `user.companyId`
     * pueda seguir siendo NOT NULL. Debilitar esa invariante —permitir usuarios
     * sin empresa— abriría un agujero en el aislamiento: una fila sin empresa no
     * la filtra nadie. La empresa plataforma queda excluida de los listados, del
     * MRR y de la facturación.
     *
     * La contraseña sale de `SEED_SUPERADMIN_PASSWORD`. **Si no está definida no
     * se crea el usuario**: dejar una credencial conocida en el código sería
     * entregarle a cualquiera el acceso a todas las empresas.
     */
    private async sembrarSuperadmin(queryRunner: QueryRunner): Promise<void> {
        const [plan] = await queryRunner.query(
            "SELECT `id` FROM `plans` WHERE `code` = 'legacy'",
        );

        await queryRunner.query(
            'INSERT INTO `companies` (`id`, `name`, `slug`, `status`, `planId`, ' +
                '`billingDay`, `isPlatform`) VALUES (?, ?, ?, ?, ?, 1, 1)',
            [
                this.PLATAFORMA_ID,
                'FleetLog (plataforma)',
                'fleetlog-plataforma',
                'active',
                plan?.id ?? null,
            ],
        );

        const email = process.env.SEED_SUPERADMIN_EMAIL;
        const password = process.env.SEED_SUPERADMIN_PASSWORD;

        if (!email || !password) {
            console.warn(
                '[Superadmin] No se creó el usuario: faltan SEED_SUPERADMIN_EMAIL ' +
                    'y SEED_SUPERADMIN_PASSWORD. Definilas y creá el usuario a mano, ' +
                    'o revertí y volvé a correr esta migración.',
            );
            return;
        }

        const bcrypt = await import('bcryptjs');
        await queryRunner.query(
            'INSERT INTO `user` (`id`, `companyId`, `email`, `name`, `password`, `role`) ' +
                'VALUES (UUID(), ?, ?, ?, ?, ?)',
            [
                this.PLATAFORMA_ID,
                email.toLowerCase(),
                'Superadmin',
                await bcrypt.hash(password, 10),
                'superadmin',
            ],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Se quita primero el usuario: la FK a companies lo exige.
        await queryRunner.query(
            "DELETE FROM `user` WHERE `companyId` = ?",
            [this.PLATAFORMA_ID],
        );
        await queryRunner.query(
            "DELETE FROM `companies` WHERE `id` = ?",
            [this.PLATAFORMA_ID],
        );

        await queryRunner.query(`ALTER TABLE \`invites\` CHANGE \`role\` \`role\` enum ('admin', 'manager', 'dispatcher', 'maintenance', 'driver', 'hr', 'auditor') NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`user\` CHANGE \`role\` \`role\` enum ('admin', 'manager', 'dispatcher', 'maintenance', 'driver', 'hr', 'auditor') NOT NULL DEFAULT 'driver'`);
        await queryRunner.query(`ALTER TABLE \`companies\` DROP COLUMN \`isPlatform\``);
        await queryRunner.query(`DROP INDEX \`IDX_7a2034302daf9817dd969f0626\` ON \`audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_5c4e592ba7096b4c6a3b41354c\` ON \`audit_logs\``);
        await queryRunner.query(`DROP TABLE \`audit_logs\``);
    }

}
