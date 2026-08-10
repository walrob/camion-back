import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Catálogo de add-ons. Entidad GLOBAL: no lleva `companyId`, igual que `Plan`.
 *
 * Los precios viven acá y no en el código para que el superadmin los ajuste sin
 * deploy — lo mismo que con los planes.
 */
@Entity('addons')
export class Addon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  /** 'gps' | 'ia' | 'erp' | 'api' | 'premium_support' | 'storage_10' | ... */
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  /** Parte fija mensual. */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  monthlyPrice: number;

  /**
   * Parte variable por vehículo. GPS: 4.900; IA: 1.900.
   * Se cobra sobre camiones facturados, no sobre unidades equivalentes: un GPS
   * se instala en un camión, no en medio acoplado.
   */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  pricePerVehicle: number;

  /** Implementación de pago único (integraciones, migraciones). */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  setupFee: number;

  /** Códigos de plan desde los que se puede contratar. Vacío = todos. */
  @Column('simple-json', { nullable: true })
  availableFromPlans: string[];

  /**
   * Features que habilita el add-on.
   *
   * Es lo que permite que API+Webhooks sea add-on en Gestión e incluido en
   * Corporate sin duplicar lógica: el gating pregunta por
   * `plan.features ∪ addons.features`.
   */
  @Column('simple-json', { nullable: true })
  features: string[];

  /** Servicios profesionales: se cobran una vez, no todos los meses. */
  @Column({ default: false })
  isOneTime: boolean;

  @Column({ default: true })
  isPublic: boolean;

  @Column('int', { default: 0 })
  sortOrder: number;
}
