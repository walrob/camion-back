import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// El código correlativo lo emite company_sequences, que numera por empresa.
@Entity('trips')
@Unique('UQ_trips_company_code', ['companyId', 'code'])
export class Trip extends TenantEntity {
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
  code: string;

  @Column()
  truckId: string;

  @ManyToOne(() => Truck)
  @JoinColumn({ name: 'truckId' })
  truck: Truck;

  @Column({ nullable: true })
  trailerId: string;

  @ManyToOne(() => Trailer, { nullable: true })
  @JoinColumn({ name: 'trailerId' })
  trailer: Trailer;

  @Column()
  driverId: string;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({ nullable: true })
  clientId: string;

  @Column()
  origin: string;

  @Column()
  destination: string;

  @Column({ nullable: true })
  cargoDescription: string;

  /**
   * Cómo clasifica la empresa este viaje según su ruta: «Ida Brasil», «Vuelta
   * Brasil», «Nacional/UY/PY».
   *
   * Es una clave del catálogo `trip_classification`, no un enum: las rutas de
   * una empresa no son las de otra, y agregar la suya no puede requerir una
   * migración. `origin`/`destination` siguen siendo el detalle; esto es la
   * categoría con la que se agrupa y se reporta.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  classification: string | null;

  @Column({ type: 'timestamp', nullable: true })
  plannedStartAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  plannedEndAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date;

  @Column({ type: 'int', nullable: true })
  startOdometerKm: number;

  @Column({ type: 'int', nullable: true })
  endOdometerKm: number;

  @Column({ type: 'int', nullable: true })
  distanceKm: number;

  @Column({ type: 'enum', enum: TripStatus, default: TripStatus.ASSIGNED })
  status: TripStatus;

  @Column({ nullable: true })
  notes: string;

  /**
   * Viático de monto fijo del viaje, cuando la empresa lo paga así
   * (`settlement.perDiemMode`, docs/CONFIGURACION.md §6.4). Lleva su propia
   * moneda: un viaje a Asunción puede tener el viático en dólares aunque la
   * empresa facture en pesos.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  perDiemAmount: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  perDiemCurrency: string | null;

  /**
   * País de destino del viaje internacional, en ISO 3166-1 alfa-2
   * (docs/CONFIGURACION.md §7.6). Sólo se completa con `trip.international`
   * activo; apagado —que es el default— el viaje es exactamente el de siempre.
   *
   * Es un código y no un catálogo de empresa: un país no es vocabulario propio
   * de nadie. La lista de destinos vive en el front (`composables/usePaises.ts`)
   * y acá se valida el formato, no la pertenencia: mantener la misma lista en
   * los dos lados es justamente lo que se desincroniza.
   */
  @Column({ type: 'char', length: 2, nullable: true })
  destinationCountry: string | null;

  /**
   * Moneda en la que se espera gastar en este viaje.
   *
   * No es decorativa: es la que la bitácora **propone** en cada gasto. Quien
   * cruza a Paraguay carga en guaraníes toda la semana, y tener que elegirla de
   * nuevo en cada peaje es donde aparecen los errores de carga.
   */
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;
}
