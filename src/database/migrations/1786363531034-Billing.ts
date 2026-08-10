import { MigrationInterface, QueryRunner } from "typeorm";

export class Billing1786363531034 implements MigrationInterface {
    name = 'Billing1786363531034'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`vehicle_billing_snapshots\` (\`companyId\` varchar(36) NOT NULL, \`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`date\` date NOT NULL, \`activeTrucks\` int NOT NULL DEFAULT '0', \`inactiveTrucks\` int NOT NULL DEFAULT '0', \`activeTrailers\` int NOT NULL DEFAULT '0', \`inactiveTrailers\` int NOT NULL DEFAULT '0', INDEX \`IDX_58f16db642eace35d18e4ee9e0\` (\`companyId\`), UNIQUE INDEX \`UQ_vehicle_snapshots_company_date\` (\`companyId\`, \`date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`subscriptions\` (\`companyId\` varchar(36) NOT NULL, \`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`createdBy\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`updatedBy\` varchar(255) NULL, \`deletedAt\` datetime(6) NULL, \`deletedBy\` varchar(255) NULL, \`periodStart\` date NOT NULL, \`periodEnd\` date NOT NULL, \`expiration\` date NOT NULL, \`baseAmount\` decimal(12,2) NOT NULL DEFAULT '0.00', \`vehiclesAmount\` decimal(12,2) NOT NULL DEFAULT '0.00', \`addonsAmount\` decimal(12,2) NOT NULL DEFAULT '0.00', \`discount\` decimal(12,2) NOT NULL DEFAULT '0.00', \`amount\` decimal(12,2) NOT NULL DEFAULT '0.00', \`billedUnits\` text NULL, \`status\` enum ('issued', 'paid', 'overdue', 'void') NOT NULL DEFAULT 'issued', \`isPaid\` tinyint NOT NULL DEFAULT 0, \`paidAt\` date NULL, \`invoiceUrl\` varchar(255) NULL, \`isProrated\` tinyint NOT NULL DEFAULT 0, \`notes\` varchar(255) NULL, INDEX \`IDX_ea19a7bd47edc90d4f1f6f6f31\` (\`companyId\`), INDEX \`IDX_27c86bfe975a56e07aa1c43085\` (\`companyId\`, \`periodStart\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`payments\` (\`companyId\` varchar(36) NOT NULL, \`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`createdBy\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`updatedBy\` varchar(255) NULL, \`deletedAt\` datetime(6) NULL, \`deletedBy\` varchar(255) NULL, \`paidAt\` date NOT NULL, \`amount\` decimal(12,2) NOT NULL, \`method\` enum ('transfer', 'cash', 'check', 'mercadopago', 'other') NOT NULL DEFAULT 'transfer', \`reference\` varchar(255) NULL, \`receiptUrl\` varchar(255) NULL, \`notes\` varchar(255) NULL, \`subscriptionId\` varchar(255) NOT NULL, INDEX \`IDX_79fa12c269730f9e1eb40b09d3\` (\`companyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`company_plan_updates\` (\`companyId\` varchar(36) NOT NULL, \`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`createdBy\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`changeType\` enum ('plan_upgrade', 'plan_downgrade', 'addon_added', 'addon_removed', 'prepay_changed') NOT NULL, \`status\` enum ('pending', 'applied', 'cancelled') NOT NULL DEFAULT 'pending', \`fromCode\` varchar(255) NULL, \`toCode\` varchar(255) NULL, \`effectiveAt\` timestamp NOT NULL, \`appliedAt\` timestamp NULL, \`notes\` varchar(255) NULL, INDEX \`IDX_60d3728776bc2589127d83030b\` (\`companyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`addons\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deletedAt\` datetime(6) NULL, \`code\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` varchar(255) NULL, \`monthlyPrice\` decimal(12,2) NOT NULL DEFAULT '0.00', \`pricePerVehicle\` decimal(12,2) NOT NULL DEFAULT '0.00', \`setupFee\` decimal(12,2) NOT NULL DEFAULT '0.00', \`availableFromPlans\` text NULL, \`features\` text NULL, \`isOneTime\` tinyint NOT NULL DEFAULT 0, \`isPublic\` tinyint NOT NULL DEFAULT 1, \`sortOrder\` int NOT NULL DEFAULT '0', UNIQUE INDEX \`IDX_0e613feca1d38f47ca5e1d9b9d\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`company_addons\` (\`companyId\` varchar(36) NOT NULL, \`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`createdBy\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`updatedBy\` varchar(255) NULL, \`deletedAt\` datetime(6) NULL, \`deletedBy\` varchar(255) NULL, \`addonId\` varchar(255) NOT NULL, \`quantity\` int NOT NULL DEFAULT '1', \`startedAt\` date NOT NULL, \`endedAt\` date NULL, \`scheduledEndAt\` date NULL, INDEX \`IDX_daace9824582c87ef4c04f2172\` (\`companyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`companies\` ADD \`prepay\` varchar(255) NOT NULL DEFAULT 'mensual'`);
        await queryRunner.query(`ALTER TABLE \`trucks\` ADD \`billingStatus\` enum ('active', 'inactive', 'decommissioned') NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE \`trucks\` ADD \`billingInactiveSince\` date NULL`);
        await queryRunner.query(`ALTER TABLE \`trailers\` ADD \`billingStatus\` enum ('active', 'inactive', 'decommissioned') NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE \`trailers\` ADD \`billingInactiveSince\` date NULL`);
        await queryRunner.query(`ALTER TABLE \`vehicle_billing_snapshots\` ADD CONSTRAINT \`FK_58f16db642eace35d18e4ee9e0c\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`FK_ea19a7bd47edc90d4f1f6f6f312\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`payments\` ADD CONSTRAINT \`FK_79fa12c269730f9e1eb40b09d3b\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`payments\` ADD CONSTRAINT \`FK_2017d0cbfdbfec6b1b388e6aa08\` FOREIGN KEY (\`subscriptionId\`) REFERENCES \`subscriptions\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_plan_updates\` ADD CONSTRAINT \`FK_60d3728776bc2589127d83030b4\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_addons\` ADD CONSTRAINT \`FK_daace9824582c87ef4c04f21720\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_addons\` ADD CONSTRAINT \`FK_986a420de173ac7f5f1b58b893e\` FOREIGN KEY (\`addonId\`) REFERENCES \`addons\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);

        await this.sembrarAddons(queryRunner);
    }

    /**
     * Catálogo de add-ons con los precios de `MODELO-COMERCIAL.md` §5.2 y §5.3.
     *
     * Viven en la base, no en el código: el superadmin los ajusta sin deploy,
     * igual que los planes. `features` es lo que permite que API + Webhooks sea
     * add-on en Gestión e incluido en Corporate sin duplicar lógica.
     */
    private async sembrarAddons(queryRunner: QueryRunner): Promise<void> {
        const addons = [
            // code, nombre, mensual, porVehículo, setup, planes, features, único, orden
            ['gps', 'Integración GPS / telemetría', 0, 4900, 0, ['operacion', 'gestion', 'corporate'], [], 0, 1],
            ['erp', 'Integración ERP / contable', 89000, 0, 350000, ['gestion', 'corporate'], [], 0, 2],
            ['api', 'API REST + Webhooks', 119000, 0, 0, ['gestion'], ['api'], 0, 3],
            ['ia', 'FleetLog IA', 149000, 1900, 0, ['operacion', 'gestion', 'corporate'], [], 0, 4],
            ['premium_support', 'Soporte Premium', 179000, 0, 0, [], [], 0, 5],
            ['client_portal', 'Portal del dador de carga', 129000, 0, 0, ['gestion', 'corporate'], [], 0, 6],
            ['bi', 'Reportes personalizados / BI', 99000, 0, 0, ['gestion', 'corporate'], ['scheduled_reports'], 0, 7],
            ['automations', 'Automatizaciones avanzadas', 69000, 0, 0, ['operacion'], ['alert_thresholds'], 0, 8],
            ['white_label', 'Marca blanca', 149000, 0, 0, ['gestion', 'corporate'], ['white_label'], 0, 9],
            // Almacenamiento: dos escalones fijos (§7.7).
            ['storage_10', 'Almacenamiento hasta 10 GB', 5900, 0, 0, [], [], 0, 10],
            ['storage_50', 'Almacenamiento hasta 50 GB', 24900, 0, 0, [], [], 0, 11],
            // Servicios profesionales: pago único, no entran en el recurrente.
            ['onboarding', 'Implementación / Onboarding', 0, 0, 0, [], [], 1, 20],
            ['migration', 'Migración de datos', 0, 0, 690000, [], [], 1, 21],
            ['training', 'Capacitación on-site (por jornada)', 0, 0, 290000, [], [], 1, 22],
            ['consulting', 'Consultoría de procesos', 0, 0, 1200000, [], [], 1, 23],
        ];

        for (const [code, name, monthly, perVehicle, setup, planes, features, oneTime, orden] of addons) {
            await queryRunner.query(
                'INSERT INTO `addons` (`id`, `code`, `name`, `monthlyPrice`, `pricePerVehicle`, ' +
                '`setupFee`, `availableFromPlans`, `features`, `isOneTime`, `isPublic`, `sortOrder`) ' +
                'VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    code,
                    name,
                    monthly,
                    perVehicle,
                    setup,
                    JSON.stringify(planes),
                    JSON.stringify(features),
                    oneTime,
                    orden,
                ],
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company_addons\` DROP FOREIGN KEY \`FK_986a420de173ac7f5f1b58b893e\``);
        await queryRunner.query(`ALTER TABLE \`company_addons\` DROP FOREIGN KEY \`FK_daace9824582c87ef4c04f21720\``);
        await queryRunner.query(`ALTER TABLE \`company_plan_updates\` DROP FOREIGN KEY \`FK_60d3728776bc2589127d83030b4\``);
        await queryRunner.query(`ALTER TABLE \`payments\` DROP FOREIGN KEY \`FK_2017d0cbfdbfec6b1b388e6aa08\``);
        await queryRunner.query(`ALTER TABLE \`payments\` DROP FOREIGN KEY \`FK_79fa12c269730f9e1eb40b09d3b\``);
        await queryRunner.query(`ALTER TABLE \`subscriptions\` DROP FOREIGN KEY \`FK_ea19a7bd47edc90d4f1f6f6f312\``);
        await queryRunner.query(`ALTER TABLE \`vehicle_billing_snapshots\` DROP FOREIGN KEY \`FK_58f16db642eace35d18e4ee9e0c\``);
        await queryRunner.query(`ALTER TABLE \`trailers\` DROP COLUMN \`billingInactiveSince\``);
        await queryRunner.query(`ALTER TABLE \`trailers\` DROP COLUMN \`billingStatus\``);
        await queryRunner.query(`ALTER TABLE \`trucks\` DROP COLUMN \`billingInactiveSince\``);
        await queryRunner.query(`ALTER TABLE \`trucks\` DROP COLUMN \`billingStatus\``);
        await queryRunner.query(`ALTER TABLE \`companies\` DROP COLUMN \`prepay\``);
        await queryRunner.query(`DROP INDEX \`IDX_daace9824582c87ef4c04f2172\` ON \`company_addons\``);
        await queryRunner.query(`DROP TABLE \`company_addons\``);
        await queryRunner.query(`DROP INDEX \`IDX_0e613feca1d38f47ca5e1d9b9d\` ON \`addons\``);
        await queryRunner.query(`DROP TABLE \`addons\``);
        await queryRunner.query(`DROP INDEX \`IDX_60d3728776bc2589127d83030b\` ON \`company_plan_updates\``);
        await queryRunner.query(`DROP TABLE \`company_plan_updates\``);
        await queryRunner.query(`DROP INDEX \`IDX_79fa12c269730f9e1eb40b09d3\` ON \`payments\``);
        await queryRunner.query(`DROP TABLE \`payments\``);
        await queryRunner.query(`DROP INDEX \`IDX_27c86bfe975a56e07aa1c43085\` ON \`subscriptions\``);
        await queryRunner.query(`DROP INDEX \`IDX_ea19a7bd47edc90d4f1f6f6f31\` ON \`subscriptions\``);
        await queryRunner.query(`DROP TABLE \`subscriptions\``);
        await queryRunner.query(`DROP INDEX \`UQ_vehicle_snapshots_company_date\` ON \`vehicle_billing_snapshots\``);
        await queryRunner.query(`DROP INDEX \`IDX_58f16db642eace35d18e4ee9e0\` ON \`vehicle_billing_snapshots\``);
        await queryRunner.query(`DROP TABLE \`vehicle_billing_snapshots\``);
    }

}
