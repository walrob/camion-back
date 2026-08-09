import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convierte la instalación single-tenant en multi-empresa (fase 1 del plan SaaS).
 *
 * Qué hace, en orden:
 *   1. Crea `plans`, `companies` y `company_sequences`.
 *   2. Inserta el plan interno LEGACY (sin límites) y la empresa #1.
 *   3. Agrega `companyId` a las 27 entidades de negocio, primero como NULL,
 *      después con los datos existentes asignados a la empresa #1, y recién
 *      entonces la pone NOT NULL con su índice y su clave foránea.
 *   4. Reemplaza los 10 índices únicos globales que rompían el multi-empresa
 *      por índices compuestos con `companyId`.
 *   5. Siembra `company_sequences` con el máximo código ya emitido.
 *
 * El orden 3 no es negociable: agregar la columna directamente como NOT NULL
 * falla si la tabla tiene filas, y ponerla NOT NULL antes del UPDATE también.
 *
 * ADVERTENCIA sobre `down()`: revertir restaura los índices únicos GLOBALES, y
 * eso sólo funciona mientras exista una sola empresa. Si ya se cargó una segunda
 * empresa con una patente repetida, el `down` va a fallar al recrear el índice
 * — que es el comportamiento correcto: la reversión es segura únicamente en la
 * ventana inmediatamente posterior a la migración.
 */
export class MultiTenant1786240000000 implements MigrationInterface {
  name = 'MultiTenant1786240000000';

  /**
   * Identificadores fijos: al ser deterministas, el `down` puede limpiar
   * exactamente lo que el `up` insertó.
   */
  private readonly LEGACY_PLAN_ID = '00000000-0000-4000-8000-000000000001';
  private readonly COMPANY_ID = '00000000-0000-4000-8000-000000000002';

  /**
   * Las 27 tablas de negocio que pasan a pertenecer a una empresa.
   * `index` y `fk` son los nombres que TypeORM espera según los metadatos de las
   * entidades: si se cambian, `schema:log` va a proponer recrearlos.
   */
  private readonly TENANT_TABLES: {
    table: string;
    index: string;
    fk: string;
  }[] = [
    { table: 'user', index: 'IDX_86586021a26d1180b0968f9850', fk: 'FK_86586021a26d1180b0968f98502' },
    { table: 'fleets', index: 'IDX_ccd66320317fcdded55b1e73b5', fk: 'FK_ccd66320317fcdded55b1e73b56' },
    { table: 'trucks', index: 'IDX_77b3a2c7422de0a77606f48f67', fk: 'FK_77b3a2c7422de0a77606f48f67a' },
    { table: 'trailers', index: 'IDX_4d75988a257ed8804ddc4502bc', fk: 'FK_4d75988a257ed8804ddc4502bca' },
    { table: 'certifications', index: 'IDX_bc9d08da76c6135bd0681592cc', fk: 'FK_bc9d08da76c6135bd0681592cc9' },
    { table: 'truck_assignments', index: 'IDX_592c02952a4e8450d85244f28c', fk: 'FK_592c02952a4e8450d85244f28ce' },
    { table: 'employment_movements', index: 'IDX_7e2f7b3e8c9419b757c6c9ad27', fk: 'FK_7e2f7b3e8c9419b757c6c9ad274' },
    { table: 'employees', index: 'IDX_c7b030a4514a003d9d8d31a812', fk: 'FK_c7b030a4514a003d9d8d31a812b' },
    { table: 'drivers', index: 'IDX_658e386266eb3045c0fc9776dd', fk: 'FK_658e386266eb3045c0fc9776dd2' },
    { table: 'trips', index: 'IDX_3394c9a34dd5b2c8a35d5e140d', fk: 'FK_3394c9a34dd5b2c8a35d5e140db' },
    { table: 'trip_log_entries', index: 'IDX_2896059dbdb1448e43244edff0', fk: 'FK_2896059dbdb1448e43244edff0b' },
    { table: 'settlements', index: 'IDX_ca7c3bc212f8579a6f28d8a930', fk: 'FK_ca7c3bc212f8579a6f28d8a9305' },
    { table: 'oea_inspection_items', index: 'IDX_78e1a6627f9211c3661253f08c', fk: 'FK_78e1a6627f9211c3661253f08c5' },
    { table: 'oea_inspections', index: 'IDX_c30a3ea84ab6c9f9bd1ab41816', fk: 'FK_c30a3ea84ab6c9f9bd1ab418167' },
    { table: 'messages', index: 'IDX_74eec275bd65494a399ad9553e', fk: 'FK_74eec275bd65494a399ad9553ef' },
    { table: 'maintenance_plans', index: 'IDX_0d3dfb8ceec9f091cccf6da961', fk: 'FK_0d3dfb8ceec9f091cccf6da9617' },
    { table: 'maintenance_orders', index: 'IDX_fdae4a24dc1fba6e25b4d59126', fk: 'FK_fdae4a24dc1fba6e25b4d591262' },
    { table: 'incident_events', index: 'IDX_ad1f04e972290a47490d20a10f', fk: 'FK_ad1f04e972290a47490d20a10f3' },
    { table: 'incidents', index: 'IDX_574744dd392691b38d63267504', fk: 'FK_574744dd392691b38d632675043' },
    { table: 'fuel_records', index: 'IDX_c690c880b6c14dbb8f9375ee67', fk: 'FK_c690c880b6c14dbb8f9375ee67b' },
    { table: 'documents', index: 'IDX_6f0a96a5bd71aab8902c8c678b', fk: 'FK_6f0a96a5bd71aab8902c8c678b1' },
    { table: 'attachments', index: 'IDX_b8d56ad5c1d70979b591d918e3', fk: 'FK_b8d56ad5c1d70979b591d918e30' },
    { table: 'checklist_items', index: 'IDX_44fa7915cb59abb9465e4c8e2c', fk: 'FK_44fa7915cb59abb9465e4c8e2c5' },
    { table: 'checklists', index: 'IDX_000b437221d15077e319125bc6', fk: 'FK_000b437221d15077e319125bc62' },
    { table: 'alerts', index: 'IDX_5f17cfa889979f133c06cd152e', fk: 'FK_5f17cfa889979f133c06cd152e5' },
    { table: 'alert_rule_configs', index: 'IDX_739f33adcf32d213ea0a88215c', fk: 'FK_739f33adcf32d213ea0a88215c4' },
    { table: 'device_tokens', index: 'IDX_6bb9bfe4b2171b0c74c0ca4949', fk: 'FK_6bb9bfe4b2171b0c74c0ca4949b' },
  ];

  /**
   * Índices únicos GLOBALES que se reemplazan por compuestos con `companyId`.
   * `oldIndex` es el nombre autogenerado que existe hoy en la base.
   */
  private readonly UNIQUE_SWAPS: {
    table: string;
    column: string;
    oldIndex: string;
    newIndex: string;
  }[] = [
    { table: 'fleets', column: 'code', oldIndex: 'IDX_d411624e082684248508967bd1', newIndex: 'UQ_fleets_company_code' },
    { table: 'trucks', column: 'plate', oldIndex: 'IDX_43b4c59e7939442f6001329244', newIndex: 'UQ_trucks_company_plate' },
    { table: 'trailers', column: 'plate', oldIndex: 'IDX_82e5c87a5c62c485f375735a13', newIndex: 'UQ_trailers_company_plate' },
    { table: 'employees', column: 'documentId', oldIndex: 'IDX_5c581edf8e7d445c33c9d483fc', newIndex: 'UQ_employees_company_document' },
    { table: 'trips', column: 'code', oldIndex: 'IDX_3982a4b84ea9eaaf91ecc0abd8', newIndex: 'UQ_trips_company_code' },
    { table: 'trip_log_entries', column: 'clientId', oldIndex: 'IDX_d26c22739f57ea36b609f91ef1', newIndex: 'UQ_trip_log_entries_company_client' },
    { table: 'oea_inspections', column: 'clientId', oldIndex: 'IDX_e237fa8f77f6a58be89232bb6f', newIndex: 'UQ_oea_inspections_company_client' },
    { table: 'incidents', column: 'code', oldIndex: 'IDX_af1cd86c79751f7e6b17a8b7fe', newIndex: 'UQ_incidents_company_code' },
    { table: 'fuel_records', column: 'clientId', oldIndex: 'IDX_9cc513715e85bff0f798eb375d', newIndex: 'UQ_fuel_records_company_client' },
    { table: 'alert_rule_configs', column: 'key', oldIndex: 'IDX_f60b70d7d5ccd83943ab284915', newIndex: 'UQ_alert_rule_configs_company_key' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Catálogo global: planes y empresas
    // ------------------------------------------------------------------
    await queryRunner.query(
      `CREATE TABLE \`plans\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`createdBy\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`updatedBy\` varchar(255) NULL, \`deletedAt\` datetime(6) NULL, \`deletedBy\` varchar(255) NULL, \`code\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` varchar(255) NULL, \`baseFee\` decimal(12,2) NOT NULL DEFAULT '0.00', \`pricePerVehicle\` decimal(12,2) NOT NULL DEFAULT '0.00', \`minVehicles\` int NOT NULL DEFAULT '0', \`setupFee\` decimal(12,2) NOT NULL DEFAULT '0.00', \`features\` text NULL, \`limits\` text NULL, \`isPublic\` tinyint NOT NULL DEFAULT 1, \`isNegotiated\` tinyint NOT NULL DEFAULT 0, \`sortOrder\` int NOT NULL DEFAULT '0', UNIQUE INDEX \`IDX_95f7ef3fc4c31a3545b4d825dd\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`companies\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`createdBy\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`updatedBy\` varchar(255) NULL, \`deletedAt\` datetime(6) NULL, \`deletedBy\` varchar(255) NULL, \`name\` varchar(255) NOT NULL, \`slug\` varchar(255) NOT NULL, \`cuit\` varchar(255) NULL, \`phone\` varchar(255) NULL, \`address\` varchar(255) NULL, \`city\` varchar(255) NULL, \`state\` varchar(255) NULL, \`status\` enum ('trial', 'active', 'defaulter', 'blocked', 'cancelled') NOT NULL DEFAULT 'trial', \`trialEndsAt\` timestamp NULL, \`cancelledAt\` timestamp NULL, \`cancelledBy\` varchar(255) NULL, \`planId\` varchar(36) NULL, \`scheduledPlanId\` varchar(36) NULL, \`scheduledEffectiveAt\` timestamp NULL, \`invoiceEmail\` varchar(255) NULL, \`invoiceCuit\` varchar(255) NULL, \`invoiceName\` varchar(255) NULL, \`billingDay\` int NOT NULL DEFAULT '1', \`logoUrl\` varchar(255) NULL, \`primaryColor\` varchar(255) NULL, UNIQUE INDEX \`IDX_b28b07d25e4324eee577de5496\` (\`slug\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`company_sequences\` (\`companyId\` varchar(36) NOT NULL, \`id\` varchar(36) NOT NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`key\` varchar(255) NOT NULL, \`lastValue\` int NOT NULL DEFAULT '0', INDEX \`IDX_c0ca24a48c6467fa2c3f748eda\` (\`companyId\`), UNIQUE INDEX \`UQ_company_sequences_company_key\` (\`companyId\`, \`key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`companies\` ADD CONSTRAINT \`FK_b0a8a57da676f0b464bc6ad6c00\` FOREIGN KEY (\`planId\`) REFERENCES \`plans\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // ------------------------------------------------------------------
    // 2. Plan LEGACY y empresa #1
    // ------------------------------------------------------------------
    // El plan LEGACY existe para que la migración no le quite nada a nadie: la
    // instalación actual conserva todas las capacidades y todos los límites en
    // ilimitado. La reasignación al plan comercial que corresponda es una
    // decisión posterior, desde el panel de superadmin (fase 8).
    const legacyFeatures = JSON.stringify([
      'fleet', 'documents', 'alerts', 'trips', 'checklists', 'messages',
      'incidents', 'incidents_kanban', 'export_excel', 'trip_log',
      'settlements', 'fuel', 'fuel_ranking', 'maintenance', 'oea',
      'hr_basic', 'hr_full', 'indicators', 'alert_thresholds',
      'auditor_role', 'scheduled_reports',
    ]);
    const legacyLimits = JSON.stringify({
      retentionMonths: null,
      storageGb: null,
      alertRules: null,
      maintenancePlans: null,
      roles: ['admin', 'manager', 'dispatcher', 'maintenance', 'driver', 'hr', 'auditor'],
    });

    await queryRunner.query(
      `INSERT INTO \`plans\` (\`id\`, \`code\`, \`name\`, \`description\`, \`baseFee\`, \`pricePerVehicle\`, \`minVehicles\`, \`setupFee\`, \`features\`, \`limits\`, \`isPublic\`, \`isNegotiated\`, \`sortOrder\`) VALUES (?, 'legacy', 'Legacy (instalación original)', 'Plan interno de la instalación previa al modelo SaaS. Sin límites y fuera de la lista pública.', 0, 0, 0, 0, ?, ?, 0, 0, 99)`,
      [this.LEGACY_PLAN_ID, legacyFeatures, legacyLimits],
    );

    // Los datos de la empresa #1 se pueden fijar por variable de entorno antes
    // de correr la migración; si no, quedan estos valores y se corrigen después
    // desde el panel.
    const companyName = process.env.SEED_COMPANY_NAME || 'Empresa principal';
    const companySlug = process.env.SEED_COMPANY_SLUG || 'empresa-principal';
    const companyCuit = process.env.SEED_COMPANY_CUIT || null;

    await queryRunner.query(
      `INSERT INTO \`companies\` (\`id\`, \`name\`, \`slug\`, \`cuit\`, \`status\`, \`planId\`, \`billingDay\`) VALUES (?, ?, ?, ?, 'active', ?, 1)`,
      [this.COMPANY_ID, companyName, companySlug, companyCuit, this.LEGACY_PLAN_ID],
    );

    // ------------------------------------------------------------------
    // 3. companyId en las 27 tablas: NULL -> UPDATE -> NOT NULL
    // ------------------------------------------------------------------
    for (const { table } of this.TENANT_TABLES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`companyId\` varchar(36) NULL`,
      );
      await queryRunner.query(
        `UPDATE \`${table}\` SET \`companyId\` = ? WHERE \`companyId\` IS NULL`,
        [this.COMPANY_ID],
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\` MODIFY \`companyId\` varchar(36) NOT NULL`,
      );
    }

    // `isActive` es parte de la decisión D1: un usuario pertenece a una empresa
    // por vez y se desactiva cuando deja de trabajar en ella.
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`isActive\` tinyint NOT NULL DEFAULT 1`,
    );

    // ------------------------------------------------------------------
    // 4. Índices y claves foráneas de companyId
    // ------------------------------------------------------------------
    for (const { table, index, fk } of this.TENANT_TABLES) {
      await queryRunner.query(
        `CREATE INDEX \`${index}\` ON \`${table}\` (\`companyId\`)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE \`company_sequences\` ADD CONSTRAINT \`FK_c0ca24a48c6467fa2c3f748edad\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // ------------------------------------------------------------------
    // 5. Reemplazo de los índices únicos globales por compuestos
    // ------------------------------------------------------------------
    for (const { table, column, oldIndex, newIndex } of this.UNIQUE_SWAPS) {
      await queryRunner.query(`DROP INDEX \`${oldIndex}\` ON \`${table}\``);
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`${newIndex}\` ON \`${table}\` (\`companyId\`, \`${column}\`)`,
      );
    }

    // ------------------------------------------------------------------
    // 6. Secuencias por empresa, sembradas con el máximo código ya emitido
    // ------------------------------------------------------------------
    // Se siembra con MAX(sufijo numérico) y NO con COUNT(*): contar filas
    // devolvería un número menor si hay bajas lógicas, y el próximo alta
    // repetiría un código ya usado.
    //
    // El REGEXP no es decorativo. En la base conviven códigos que NO los generó
    // la aplicación sino los seeds, con al menos tres formatos distintos
    // ('VJ-1000', 'VJ-DEMO0', 'VJ-MRXTXQWD-0004'), y con MySQL en modo estricto
    // un CAST sobre esos sufijos aborta la migración entera.
    //
    // Filtrando por el formato exacto que emite el generador ('V-00001' para
    // viajes, 'INC-00001' para incidentes) se consiguen dos cosas: el CAST sólo
    // ve dígitos, y la secuencia arranca en el máximo realmente emitido por la
    // aplicación. Los códigos con otro formato no pueden colisionar con los
    // futuros, porque son cadenas distintas.
    await queryRunner.query(
      `INSERT INTO \`company_sequences\` (\`id\`, \`companyId\`, \`key\`, \`lastValue\`)
       SELECT UUID(), ?, 'trip',
              COALESCE(MAX(CAST(SUBSTRING(\`code\`, 3) AS UNSIGNED)), 0)
       FROM \`trips\`
       WHERE \`code\` REGEXP '^V-[0-9]+$'`,
      [this.COMPANY_ID],
    );
    await queryRunner.query(
      `INSERT INTO \`company_sequences\` (\`id\`, \`companyId\`, \`key\`, \`lastValue\`)
       SELECT UUID(), ?, 'incident',
              COALESCE(MAX(CAST(SUBSTRING(\`code\`, 5) AS UNSIGNED)), 0)
       FROM \`incidents\`
       WHERE \`code\` REGEXP '^INC-[0-9]+$'`,
      [this.COMPANY_ID],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 6/5. Volver a los índices únicos globales.
    // Falla a propósito si ya existe más de una empresa con valores repetidos:
    // en ese punto la reversión ya no es segura y hay que restaurar del backup.
    for (const { table, column, oldIndex, newIndex } of this.UNIQUE_SWAPS) {
      await queryRunner.query(`DROP INDEX \`${newIndex}\` ON \`${table}\``);
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`${oldIndex}\` ON \`${table}\` (\`${column}\`)`,
      );
    }

    // 4. Claves foráneas e índices de companyId.
    await queryRunner.query(
      `ALTER TABLE \`company_sequences\` DROP FOREIGN KEY \`FK_c0ca24a48c6467fa2c3f748edad\``,
    );
    for (const { table, index, fk } of this.TENANT_TABLES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk}\``,
      );
      await queryRunner.query(`DROP INDEX \`${index}\` ON \`${table}\``);
    }

    // 3. Columnas.
    await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`isActive\``);
    for (const { table } of this.TENANT_TABLES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`companyId\``,
      );
    }

    // 2/1. Catálogo global.
    await queryRunner.query(
      `ALTER TABLE \`companies\` DROP FOREIGN KEY \`FK_b0a8a57da676f0b464bc6ad6c00\``,
    );
    await queryRunner.query(`DROP TABLE \`company_sequences\``);
    await queryRunner.query(`DROP TABLE \`companies\``);
    await queryRunner.query(`DROP TABLE \`plans\``);
  }
}
