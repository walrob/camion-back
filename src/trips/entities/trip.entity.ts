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
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { Driver } from 'src/drivers/entities/driver.entity';

@Entity('trips')
export class Trip {
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
}
