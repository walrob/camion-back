import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';
import { User } from 'src/users/entities/user.entity';

@Entity('drivers')
export class Driver {
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
  userId: string;

  @OneToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Reconciliación con RRHH: el legajo (Employee) es el registro canónico de la
  // persona; los carnets/permisos viven en Certification. Nullable para permitir
  // choferes creados antes de existir su legajo.
  @Column({ nullable: true })
  employeeId: string;

  @Column({ nullable: true })
  licenseNumber: string;

  @Column({ nullable: true })
  licenseType: string;

  @Column({ type: 'date', nullable: true })
  licenseExpiry: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'enum', enum: DriverStatus, default: DriverStatus.ACTIVE })
  status: DriverStatus;

  @Column({ nullable: true })
  notes: string;
}
