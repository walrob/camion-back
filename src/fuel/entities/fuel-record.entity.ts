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
import { FuelType } from 'src/common/enums/fuel.enum';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// clientId se scopea por empresa: aunque sea un UUID generado por la app, no
// debe poder usarse el clientId de otra empresa para forzar una deduplicación.
@Entity('fuel_records')
@Index(['truckId'])
@Index(['driverId'])
@Unique('UQ_fuel_records_company_client', ['companyId', 'clientId'])
export class FuelRecord extends TenantEntity {
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

  /** Clave del combustible, del catálogo de la empresa (CONFIGURACION §5). */
  @Column({ length: 64, default: 'diesel' })
  fuelType: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  liters: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  pricePerLiter: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ default: 'ARS' })
  currency: string;

  /**
   * Conversión congelada a moneda base (docs/CONFIGURACION.md §7.2). Todo el
   * tablero de consumo —costo por km, precio del litro— se calcula sobre
   * `amountBase`: sumar reales con pesos daría un número que parece correcto y
   * no lo es. `null` = pendiente de cotización.
   */
  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  exchangeRate: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amountBase: number | null;

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
  @Column({ nullable: true })
  clientId: string;
}
