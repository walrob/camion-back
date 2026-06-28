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
import {
  MaintenancePlanStatus,
  MaintenanceTriggerType,
} from 'src/common/enums/maintenance.enum';
import { Truck } from 'src/fleet/entities/truck.entity';

@Entity('maintenance_plans')
export class MaintenancePlan {
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

  @Column()
  name: string;

  @Column({ type: 'enum', enum: MaintenanceTriggerType })
  triggerType: MaintenanceTriggerType;

  @Column({ type: 'int' })
  intervalValue: number;

  @Column({ type: 'int', nullable: true })
  lastServiceKm: number;

  @Column({ type: 'date', nullable: true })
  lastServiceAt: string;

  @Column({ type: 'int', nullable: true })
  nextDueKm: number;

  @Column({ type: 'date', nullable: true })
  nextDueAt: string;

  @Column({
    type: 'enum',
    enum: MaintenancePlanStatus,
    default: MaintenancePlanStatus.ACTIVE,
  })
  status: MaintenancePlanStatus;
}
