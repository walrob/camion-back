import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';
import {
  PlanUpdateStatus,
  PlanUpdateType,
} from 'src/common/enums/billing.enum';

/**
 * Histórico comercial de una empresa y cola de cambios diferidos.
 *
 * Cumple dos funciones a la vez:
 *
 *  1. **Auditoría**: qué cambió, cuándo y quién lo pidió. Ante un reclamo de
 *     facturación es la única forma de reconstruir por qué un mes salió distinto.
 *  2. **Cola de cambios diferidos**: las bajas y downgrades no se aplican en el
 *     acto (MODELO-COMERCIAL §6.4), se guardan como `PENDING` con su
 *     `effectiveAt` y las aplica el cron de renovación.
 *
 * `appliedAt` es lo que hace **idempotente** a ese cron: si corre dos veces el
 * mismo día, el segundo pase no vuelve a aplicar nada.
 */
@Entity('company_plan_updates')
export class CompanyPlanUpdate extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'enum', enum: PlanUpdateType })
  changeType: PlanUpdateType;

  @Column({
    type: 'enum',
    enum: PlanUpdateStatus,
    default: PlanUpdateStatus.PENDING,
  })
  status: PlanUpdateStatus;

  /** Plan/add-on anterior y nuevo, según el tipo de cambio. */
  @Column({ nullable: true })
  fromCode: string;

  @Column({ nullable: true })
  toCode: string;

  /** Desde cuándo rige. Para upgrades es "ahora"; para bajas, el próximo período. */
  @Column({ type: 'timestamp' })
  effectiveAt: Date;

  /** Cuándo se aplicó realmente. NULL = todavía pendiente. */
  @Column({ type: 'timestamp', nullable: true })
  appliedAt: Date | null;

  @Column({ nullable: true })
  notes: string;
}
