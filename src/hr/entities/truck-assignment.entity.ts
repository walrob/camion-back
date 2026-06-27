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
import { Employee } from './employee.entity';
import { Truck } from 'src/fleet/entities/truck.entity';

@Entity('truck_assignments')
export class TruckAssignment {
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
  employeeId: string;

  @ManyToOne(() => Employee, (employee) => employee.assignments)
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  truckId: string;

  @ManyToOne(() => Truck)
  @JoinColumn({ name: 'truckId' })
  truck: Truck;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  unassignedAt: Date;

  @Column({ default: true })
  isPrimary: boolean;

  @Column({ nullable: true })
  notes: string;
}
