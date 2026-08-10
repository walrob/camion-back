import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TrailerStatus } from 'src/common/enums/trailerStatus.enum';
import { BillingStatus } from 'src/common/enums/billing.enum';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// La patente es única DENTRO de cada empresa (mismo criterio que en camiones).
@Entity('trailers')
@Unique('UQ_trailers_company_plate', ['companyId', 'plate'])
export class Trailer extends TenantEntity {
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

  @Column()
  plate: string;

  @Column({ nullable: true })
  type: string;

  @Column({ type: 'int', nullable: true })
  loadCapacityKg: number;

  @Column({
    type: 'enum',
    enum: TrailerStatus,
    default: TrailerStatus.AVAILABLE,
  })
  status: TrailerStatus;

  @Column({ default: true })
  isActive: boolean;
  /**
   * Situación a los efectos de la FACTURACIÓN, independiente del estado
   * operativo: un camión en taller sigue facturando al 100 % porque sigue
   * siendo parte de la flota administrada. El modo inactivo factura al 30 %
   * y requiere 30 días corridos fuera de servicio (MODELO-COMERCIAL §2.3).
   */
  @Column({
    type: 'enum',
    enum: BillingStatus,
    default: BillingStatus.ACTIVE,
  })
  billingStatus: BillingStatus;

  /** Desde cuándo está en modo inactivo. Auditable ante un reclamo. */
  @Column({ type: 'date', nullable: true })
  billingInactiveSince: Date | null;

}
