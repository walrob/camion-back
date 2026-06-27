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
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { Fleet } from './fleet.entity';

@Entity('trucks')
export class Truck {
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

  @Column({ unique: true })
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
