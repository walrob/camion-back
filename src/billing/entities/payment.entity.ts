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
import { TenantEntity } from 'src/common/entities/tenant.entity';
import { PaymentMethod } from 'src/common/enums/billing.enum';
import { Subscription } from './subscription.entity';

/**
 * Pago aplicado a un período.
 *
 * Es una entidad aparte y no un par de columnas en `Subscription` porque un
 * período puede cobrarse en varias veces (una seña y el saldo, o dos
 * transferencias), y porque el comprobante de cada pago es lo que se muestra
 * ante un reclamo.
 */
@Entity('payments')
export class Payment extends TenantEntity {
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

  @Column({ type: 'date' })
  paidAt: Date;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.TRANSFER })
  method: PaymentMethod;

  /** Número de operación, CBU de origen, etc. */
  @Column({ nullable: true })
  reference: string;

  /** Comprobante en S3. */
  @Column({ nullable: true })
  receiptUrl: string;

  @Column({ nullable: true })
  notes: string;

  @ManyToOne(() => Subscription, (s) => s.payments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: Subscription;

  @Column({ type: 'uuid' })
  subscriptionId: string;
}
