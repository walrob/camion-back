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
import { MaintenanceOrderStatus } from 'src/common/enums/maintenance.enum';
import { Truck } from 'src/fleet/entities/truck.entity';

@Entity('maintenance_orders')
export class MaintenanceOrder {
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

  @Column({ nullable: true })
  planId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', nullable: true })
  odometerKm: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'simple-json', nullable: true })
  items: { name: string; cost?: number }[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cost: number;

  @Column({
    type: 'enum',
    enum: MaintenanceOrderStatus,
    default: MaintenanceOrderStatus.OPEN,
  })
  status: MaintenanceOrderStatus;

  @Column({ nullable: true })
  notes: string;
}
