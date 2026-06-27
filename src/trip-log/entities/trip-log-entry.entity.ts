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
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { Trip } from 'src/trips/entities/trip.entity';

@Entity('trip_log_entries')
@Index(['tripId'])
export class TripLogEntry {
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

  @Column({ type: 'enum', enum: TripLogType })
  type: TripLogType;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ default: 'ARS' })
  currency: string;

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
  @Column({ nullable: true, unique: true })
  clientId: string;
}
