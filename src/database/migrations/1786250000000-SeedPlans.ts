import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Siembra los cuatro planes comerciales.
 *
 * Precios, mínimos e implementación salen de `MODELO-COMERCIAL.md` §3.2 (tarifa
 * PLANA por vehículo, sin escalones) y el mapa de features del Anexo B del plan
 * de conversión a SaaS.
 *
 * Los valores viven en la base a propósito: el superadmin los edita sin deploy y
 * la landing los publica desde acá (decisión D8). El código nunca pregunta por
 * `plan.code`, sólo por feature.
 *
 * El plan `legacy` lo creó la migración MultiTenant y no se toca: es el de la
 * instalación original y tiene todas las features (decisión D2).
 */
export class SeedPlans1786250000000 implements MigrationInterface {
  name = 'SeedPlans1786250000000';

  private readonly IDS = {
    control: '00000000-0000-4000-8000-000000000011',
    operacion: '00000000-0000-4000-8000-000000000012',
    gestion: '00000000-0000-4000-8000-000000000013',
    corporate: '00000000-0000-4000-8000-000000000014',
  };

  /** En todos los planes: es lo que reemplaza al cuaderno. */
  private readonly BASE = [
    'fleet',
    'documents',
    'alerts',
    'trips',
    'checklists',
    'messages',
    'incidents',
    'driver_app',
  ];

  /** Operación agrega el control del dinero del viaje. */
  private readonly OPERACION = [
    ...this.BASE,
    'export_excel',
    'trip_log',
    'settlements',
    'fuel',
    'maintenance',
    'oea',
    'incidents_kanban',
    'hr_basic',
  ];

  /** Gestión agrega los números para decidir. */
  private readonly GESTION = [
    ...this.OPERACION,
    'fuel_ranking',
    'indicators',
    'hr_full',
    'alert_thresholds',
    'auditor_role',
    'scheduled_reports',
  ];

  /** Corporate agrega las capacidades de plataforma. */
  private readonly CORPORATE = [
    ...this.GESTION,
    'api',
    'multi_company',
    'sso',
    'sandbox',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const planes = [
      {
        id: this.IDS.control,
        code: 'control',
        name: 'Control',
        description: 'Dejá el cuaderno. Sabé qué tenés en la calle y qué se te vence.',
        baseFee: 59000,
        pricePerVehicle: 7900,
        minVehicles: 3,
        setupFee: 290000,
        features: this.BASE,
        limits: {
          retentionMonths: 6,
          storageGb: 2,
          alertRules: 3,
          maintenancePlans: 0,
          roles: ['admin', 'manager', 'dispatcher', 'driver'],
        },
        isNegotiated: 0,
        sortOrder: 1,
      },
      {
        id: this.IDS.operacion,
        code: 'operacion',
        name: 'Operación',
        description:
          'Todo el viaje bajo control, del checklist hasta la rendición firmada.',
        baseFee: 129000,
        pricePerVehicle: 12900,
        minVehicles: 5,
        setupFee: 590000,
        features: this.OPERACION,
        limits: {
          retentionMonths: 24,
          storageGb: 50,
          alertRules: 10,
          maintenancePlans: 10,
          roles: ['admin', 'manager', 'dispatcher', 'driver', 'maintenance', 'hr'],
        },
        isNegotiated: 0,
        sortOrder: 2,
      },
      {
        id: this.IDS.gestion,
        code: 'gestion',
        name: 'Gestión',
        description:
          'Decidí con números: costo por kilómetro, por camión y por chofer.',
        baseFee: 249000,
        pricePerVehicle: 18900,
        minVehicles: 8,
        setupFee: 990000,
        features: this.GESTION,
        limits: {
          retentionMonths: 60,
          storageGb: 250,
          alertRules: null,
          maintenancePlans: null,
          roles: [
            'admin',
            'manager',
            'dispatcher',
            'driver',
            'maintenance',
            'hr',
            'auditor',
          ],
        },
        isNegotiated: 0,
        sortOrder: 3,
      },
      {
        id: this.IDS.corporate,
        code: 'corporate',
        name: 'Corporate',
        description: 'Varias empresas, una sola operación. Precio con tope y contrato.',
        // Piso de referencia: el precio real se negocia (§7.3 del modelo).
        baseFee: 490000,
        pricePerVehicle: 10900,
        minVehicles: 25,
        setupFee: 2500000,
        features: this.CORPORATE,
        limits: {
          retentionMonths: null,
          storageGb: null,
          alertRules: null,
          maintenancePlans: null,
          roles: [
            'admin',
            'manager',
            'dispatcher',
            'driver',
            'maintenance',
            'hr',
            'auditor',
          ],
        },
        isNegotiated: 1,
        sortOrder: 4,
      },
    ];

    for (const p of planes) {
      await queryRunner.query(
        'INSERT INTO `plans` (`id`, `code`, `name`, `description`, `baseFee`, ' +
          '`pricePerVehicle`, `minVehicles`, `setupFee`, `features`, `limits`, ' +
          '`isPublic`, `isNegotiated`, `sortOrder`) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
        [
          p.id,
          p.code,
          p.name,
          p.description,
          p.baseFee,
          p.pricePerVehicle,
          p.minVehicles,
          p.setupFee,
          JSON.stringify(p.features),
          JSON.stringify(p.limits),
          p.isNegotiated,
          p.sortOrder,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sólo borra los planes que sembró esta migración, y sólo si ninguna empresa
    // los está usando: dejar una empresa sin plan rompería el gating entero.
    const ids = Object.values(this.IDS);
    const [{ enUso }] = (await queryRunner.query(
      `SELECT COUNT(*) AS enUso FROM \`companies\` WHERE \`planId\` IN (?, ?, ?, ?)`,
      ids,
    )) as { enUso: number }[];

    if (Number(enUso) > 0) {
      throw new Error(
        `No se pueden borrar los planes: hay ${enUso} empresa(s) usándolos. ` +
          'Reasignalas antes de revertir esta migración.',
      );
    }

    await queryRunner.query(
      `DELETE FROM \`plans\` WHERE \`id\` IN (?, ?, ?, ?)`,
      ids,
    );
  }
}
