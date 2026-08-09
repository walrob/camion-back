import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Límites cuantitativos del plan. `null` = ilimitado.
 * Se aplican en la fase 4; acá se definen para que el catálogo ya los transporte.
 */
export interface PlanLimits {
  /** Meses de histórico visibles. `null` = sin corte. */
  retentionMonths: number | null;
  /** Almacenamiento de adjuntos en GB. `null` = ilimitado. */
  storageGb: number | null;
  /** Reglas de alerta activas. `null` = ilimitadas. */
  alertRules: number | null;
  /** Planes de mantenimiento activos. `null` = ilimitados. */
  maintenancePlans: number | null;
  /** Roles habilitados para la empresa. */
  roles: string[];
}

/**
 * Catálogo de planes comerciales. Es una entidad GLOBAL: no lleva `companyId`.
 *
 * Única fuente de verdad de precios, features y límites: no hardcodear códigos
 * de plan en el código de negocio. Todo el gating pregunta por feature
 * (`plan.features`), nunca por `plan.code`.
 */
@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  updatedBy: string;

  @DeleteDateColumn()
  deletedAt: Date;

  @Column({ nullable: true })
  deletedBy: string;

  /** 'control' | 'operacion' | 'gestion' | 'corporate' | 'legacy' */
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  // --- Precio (MODELO-COMERCIAL §3.2) ---

  /** Abono base mensual del plan, fijo por cuenta. */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  baseFee: number;

  /** Tarifa PLANA por vehículo. Sin tramos ni escalones de volumen (§7.2). */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  pricePerVehicle: number;

  /**
   * Mínimo de vehículos facturables del plan (3 / 5 / 8 / 25).
   * Se cuenta SOLO sobre camiones activos: un acoplado factura al 50% pero no
   * ayuda a alcanzar el mínimo (decisión D3 del plan de conversión a SaaS).
   */
  @Column('int', { default: 0 })
  minVehicles: number;

  /** Implementación / onboarding, de pago único. */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  setupFee: number;

  // --- Alcance funcional ---

  /** Códigos de feature habilitadas. El gating de la fase 3 lee de acá. */
  @Column('simple-json', { nullable: true })
  features: string[];

  /** Límites cuantitativos. Se aplican en la fase 4. */
  @Column('simple-json', { nullable: true })
  limits: PlanLimits;

  // --- Presentación comercial ---

  /** Se muestra en la landing pública (`GET /plans/public`). */
  @Column({ default: true })
  isPublic: boolean;

  /** Precio a convenir (Corporate): no se autogestiona desde la web. */
  @Column({ default: false })
  isNegotiated: boolean;

  @Column('int', { default: 0 })
  sortOrder: number;
}
