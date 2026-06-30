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
import { FuelType } from 'src/common/enums/fuel.enum';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Driver } from 'src/drivers/entities/driver.entity';

@Entity('fuel_records')
@Index(['truckId'])
@Index(['driverId'])
export class FuelRecord {
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
  truckId: string;

  @ManyToOne(() => Truck)
  @JoinColumn({ name: 'truckId' })
  truck: Truck;

  // Quién cargó (opcional: la carga puede hacerla la base sin chofer asignado).
  @Column({ nullable: true })
  driverId: string;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  // Vínculo opcional con un viaje.
  @Column({ nullable: true })
  tripId: string;

  @Column({ type: 'enum', enum: FuelType, default: FuelType.DIESEL })
  fuelType: FuelType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  liters: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  pricePerLiter: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ default: 'ARS' })
  currency: string;

  // Odómetro al momento de la carga (para calcular rendimiento l/100km).
  @Column({ type: 'int', nullable: true })
  odometerKm: number;

  // Tanque lleno: requerido por el método tanque-lleno de cálculo de rendimiento.
  @Column({ default: true })
  fullTank: boolean;

  @Column({ nullable: true })
  station: string;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lng: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  occurredAt: Date;

  @Column({ nullable: true })
  notes: string;

  // Idempotencia para sincronización offline del chofer.
  @Column({ nullable: true, unique: true })
  clientId: string;
}
