import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OeaResult } from 'src/common/enums/oea.enum';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { OeaInspectionItem } from './oea-inspection-item.entity';

@Entity('oea_inspections')
@Index(['truckId'])
@Index(['driverId'])
export class OeaInspection {
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

  // Vínculo opcional con un viaje.
  @Column({ nullable: true })
  tripId: string;

  @Column()
  truckId: string;

  @ManyToOne(() => Truck)
  @JoinColumn({ name: 'truckId' })
  truck: Truck;

  @Column({ nullable: true })
  trailerId: string;

  @Column()
  driverId: string;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  // ─── Sección 1: datos del transporte y documentación ───
  @Column({ nullable: true })
  tripNumber: string;

  @Column({ nullable: true })
  origin: string;

  @Column({ nullable: true })
  destination: string;

  @Column({ nullable: true })
  cargoDescription: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  cargoWeightKg: number;

  @Column({ nullable: true })
  customsSealNumber: string;

  @Column({ nullable: true })
  securitySealNumber: string;

  @Column({ nullable: true })
  driverDocument: string;

  @Column({ nullable: true })
  driverLicense: string;

  // ─── Resultado / firma / ubicación ───
  @Column({ type: 'enum', enum: OeaResult, default: OeaResult.PENDING })
  result: OeaResult;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lng: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  inspectedAt: Date;

  @Column({ nullable: true })
  signatureKey: string;

  @Column({ type: 'timestamp', nullable: true })
  signedAt: Date;

  @Column({ nullable: true })
  notes: string;

  // Idempotencia para sincronización offline del chofer.
  @Column({ nullable: true, unique: true })
  clientId: string;

  @OneToMany(() => OeaInspectionItem, (item) => item.inspection, {
    cascade: true,
  })
  items: OeaInspectionItem[];
}
