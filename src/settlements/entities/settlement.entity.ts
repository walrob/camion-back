import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SettlementStatus } from 'src/common/enums/settlementStatus.enum';
import { Trip } from 'src/trips/entities/trip.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

@Entity('settlements')
@Index(['tripId'])
export class Settlement extends TenantEntity {
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
  tripId: string;

  @ManyToOne(() => Trip)
  @JoinColumn({ name: 'tripId' })
  trip: Trip;

  @Column({ type: 'simple-json', nullable: true })
  totalsByType: Record<string, number>;

  /**
   * Subtotales en la moneda en que se gastó, para un viaje internacional
   * (docs/CONFIGURACION.md §7.4). El neto de la rendición sigue siendo uno solo,
   * en moneda base; esto es lo que después se discute con el chofer, que gastó
   * guaraníes y no pesos.
   */
  @Column({ type: 'simple-json', nullable: true })
  totalsByCurrency: Record<string, number> | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalExpenses: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAdvances: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  netToSettle: number;

  @Column({ default: 'ARS' })
  currency: string;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.DRAFT,
  })
  status: SettlementStatus;

  @Column({ nullable: true })
  pdfKey: string;
}
