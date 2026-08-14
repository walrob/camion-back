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
import { PaymentMethod, PaymentStatusMp } from 'src/common/enums/billing.enum';
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

  // --- Mercado Pago ---

  /**
   * Identificador del pago en Mercado Pago. **Único**.
   *
   * La unicidad está en la base y no sólo en el código porque MP reenvía el
   * mismo aviso varias veces —y en paralelo— hasta recibir un 200. Un `SELECT`
   * previo no alcanza: dos avisos simultáneos pasan los dos por el chequeo y
   * escriben los dos. El índice es lo único que no se puede correr (R9.2).
   *
   * Es NULL en los pagos cargados a mano (transferencia, efectivo); MySQL
   * admite varios NULL en un índice único, así que no estorba.
   */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  mpPaymentId: string | null;

  /** Suscripción de MP que generó el débito, si vino de un cobro automático. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  mpPreapprovalId: string | null;

  /**
   * Estado del cobro. Sólo `PAID` acredita: un pago pendiente o rechazado se
   * registra igual para poder explicarle al cliente qué pasó con su intento.
   */
  @Column({
    type: 'enum',
    enum: PaymentStatusMp,
    default: PaymentStatusMp.PAID,
  })
  status: PaymentStatusMp;

  @ManyToOne(() => Subscription, (s) => s.payments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: Subscription;

  @Column({ type: 'uuid' })
  subscriptionId: string;
}
