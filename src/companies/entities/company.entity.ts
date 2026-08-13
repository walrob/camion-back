import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { StorageAddon } from 'src/common/enums/storageAddon.enum';
import { Plan } from 'src/plans/entities/plan.entity';

/**
 * Empresa de transporte: el tenant del sistema.
 *
 * Es una entidad GLOBAL (no hereda de `TenantEntity`): es la raíz a la que
 * apuntan las 27 entidades de negocio a través de `companyId`.
 */
@Entity('companies')
export class Company {
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

  // --- Identificación ---

  /** Razón social. */
  @Column()
  name: string;

  /** Identificador legible y estable. Se usa en URLs y en marca blanca. */
  @Column({ unique: true })
  slug: string;

  /**
   * Empresa que representa a FleetLog, no a un cliente.
   *
   * Existe para que el superadmin tenga una empresa a la que pertenecer y así
   * `user.companyId` pueda seguir siendo NOT NULL. Debilitar esa invariante
   * —permitir usuarios sin empresa— abriría un agujero en el aislamiento: una
   * fila sin empresa no la filtra nadie.
   *
   * Queda excluida de los listados, del MRR y de la facturación: no es un
   * cliente.
   */
  @Column({ default: false })
  isPlatform: boolean;

  @Column({ nullable: true })
  cuit: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  // --- Estado comercial ---

  @Column({
    type: 'enum',
    enum: CompanyStatus,
    default: CompanyStatus.TRIAL,
  })
  status: CompanyStatus;

  /** Fin de la prueba gratuita. NULL = sin trial vigente. */
  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt: Date;

  /**
   * Paso del onboarding guiado que falta completar. `0` = terminado.
   *
   * El middleware del front lo usa para llevar a la empresa nueva por la carga
   * inicial en vez de dejarla frente a un sistema vacío, que es la forma más
   * rápida de perder a alguien que recién se dio de alta.
   */
  @Column('int', { default: 0 })
  onboardingStep: number;

  /** Fecha de la baja. NULL = nunca se dio de baja. */
  @Column({ type: 'timestamp', nullable: true, default: null })
  cancelledAt: Date | null;

  @Column({ nullable: true })
  cancelledBy: string;

  // --- Plan ---

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ type: 'varchar', length: 36, nullable: true })
  planId: string;

  /**
   * Cambio de plan diferido al próximo período. NULL = sigue el plan actual.
   *
   * Las bajas y downgrades no se aplican en el acto: si se aplicaran, un cliente
   * podría subir y bajar de plan dentro del mismo período facturado y distorsionar
   * la recaudación. Las subidas sí son inmediatas y se prorratean (fricción
   * asimétrica, MODELO-COMERCIAL §6.4).
   */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  scheduledPlanId: string | null;

  /** Inicio del próximo período, cuando se hace efectivo el cambio programado. */
  @Column({ type: 'timestamp', nullable: true, default: null })
  scheduledEffectiveAt: Date | null;

  // --- Facturación ---

  @Column({ nullable: true })
  invoiceEmail: string;

  @Column({ nullable: true })
  invoiceCuit: string;

  @Column({ nullable: true })
  invoiceName: string;

  /** Día del mes en que se emite el período facturable. */
  @Column('int', { default: 1 })
  billingDay: number;

  /**
   * Modalidad de prepago: define el descuento del §7.4 (anual −15 %,
   * bianual −22 %). Es la única palanca de descuento sobre el recurrente.
   */
  @Column({ default: 'mensual' })
  prepay: string;

  // --- Consumo ---

  /**
   * Bytes de adjuntos en uso. Es un acumulado que se ajusta al subir y al
   * borrar, no un `SUM()` en vivo: contar decenas de miles de adjuntos en cada
   * subida sería inviable.
   *
   * Todo contador incremental se desvía (subidas fallidas, borrados fuera de la
   * aplicación), así que un cron nocturno lo reconcilia contra la suma real.
   */
  @Column('bigint', { default: 0 })
  storageBytesUsed: string;

  /**
   * Escalón de almacenamiento adicional contratado.
   *
   * Permite que un cliente que llenó su espacio siga en su plan pagando sólo la
   * capacidad: el costo de S3 es proporcional a los GB, no a las
   * funcionalidades. El tope efectivo es el mayor entre lo que incluye el plan y
   * el techo del escalón.
   */
  @Column({
    type: 'enum',
    enum: StorageAddon,
    default: StorageAddon.NONE,
  })
  storageAddon: StorageAddon;

  // --- Marca blanca (add-on) ---

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  primaryColor: string;
}
