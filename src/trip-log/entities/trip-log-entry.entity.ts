import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { Trip } from 'src/trips/entities/trip.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// clientId se scopea por empresa (mismo criterio que en fuel_records).
@Entity('trip_log_entries')
@Index(['tripId'])
@Unique('UQ_trip_log_entries_company_client', ['companyId', 'clientId'])
export class TripLogEntry extends TenantEntity {
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

  /**
   * Clave del tipo de gasto. Texto y no enum: la empresa arma su propio
   * catálogo (docs/CONFIGURACION.md §5). Lo que resta en la rendición lo decide
   * el `behavior` del catálogo, no esta columna.
   */
  @Column({ length: 64 })
  type: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  /** Moneda en la que se gastó. Puede no ser la base de la empresa (§7). */
  @Column({ default: 'ARS' })
  currency: string;

  /**
   * Cotización aplicada y el importe ya convertido a moneda base.
   *
   * Se calculan **al registrar y no se recalculan nunca**: si se recalcularan,
   * una rendición cerrada cambiaría de valor cada vez que se mueve el dólar y
   * dejaría de ser un comprobante (docs/CONFIGURACION.md §7.2).
   *
   * `amountBase` en `null` significa **pendiente de conversión**: se cargó en
   * otra moneda y ese día no había cotización. El movimiento vale igual; lo
   * resuelve la oficina cargando la cotización (§7.3).
   */
  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  exchangeRate: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amountBase: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  liters: number;

  @Column({ type: 'int', nullable: true })
  odometerKm: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lng: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  occurredAt: Date;

  @Column({ nullable: true })
  notes: string;

  // Idempotencia para sincronización offline del chofer (Fase 10).
  @Column({ nullable: true })
  clientId: string;
}
