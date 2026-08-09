import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from 'src/common/enums/incident.enum';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { User } from 'src/users/entities/user.entity';
import { IncidentEvent } from './incident-event.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// El código correlativo lo emite company_sequences, que numera por empresa.
@Entity('incidents')
@Unique('UQ_incidents_company_code', ['companyId', 'code'])
export class Incident extends TenantEntity {
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

  @Column({ nullable: true })
  tripId: string;

  @Column()
  truckId: string;

  @ManyToOne(() => Truck)
  @JoinColumn({ name: 'truckId' })
  truck: Truck;

  @Column()
  driverId: string;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({ type: 'enum', enum: IncidentType })
  type: IncidentType;

  @Column({
    type: 'enum',
    enum: IncidentSeverity,
    default: IncidentSeverity.MEDIUM,
  })
  severity: IncidentSeverity;

  @Column({
    type: 'enum',
    enum: IncidentStatus,
    default: IncidentStatus.PENDING,
  })
  status: IncidentStatus;

  @Column({ nullable: true })
  assignedToUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignedToUserId' })
  assignedTo?: User;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lng: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @OneToMany(() => IncidentEvent, (event) => event.incident)
  events: IncidentEvent[];
}
