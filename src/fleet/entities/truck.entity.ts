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
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { Fleet } from './fleet.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// La patente es única DENTRO de cada empresa: dos empresas distintas pueden
// tener cargado el mismo camión (por ejemplo, tras la venta de una unidad).
@Entity('trucks')
@Unique('UQ_trucks_company_plate', ['companyId', 'plate'])
export class Truck extends TenantEntity {
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
  internalNumber: string;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ type: 'int', nullable: true })
  year: number;

  @Column({ nullable: true })
  type: string;

  @Column({ type: 'int', nullable: true })
  loadCapacityKg: number;

  @Column({ type: 'int', default: 0 })
  currentOdometerKm: number;

  @Column({ type: 'int', default: 0 })
  engineHours: number;

  @Column({ type: 'enum', enum: TruckStatus, default: TruckStatus.AVAILABLE })
  status: TruckStatus;

  @Column({ nullable: true })
  fleetId: string;

  @ManyToOne(() => Fleet, (fleet) => fleet.trucks, { nullable: true })
  @JoinColumn({ name: 'fleetId' })
  fleet: Fleet;
}
