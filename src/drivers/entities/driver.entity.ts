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
import { Employee } from 'src/hr/entities/employee.entity';

/**
 * Driver es una capacidad operativa de un Employee (RRHH). El dato personal y el
 * acceso a la app (User) viven en Employee; aquí solo se guarda lo de conducción.
 * Relación 1:1 con Employee: un legajo no puede tener dos perfiles de chofer.
 */
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

  @Column({ unique: true })
  employeeId: string;

  @OneToOne(() => Employee)
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ nullable: true })
  licenseNumber: string;

  @Column({ nullable: true })
  licenseType: string;

  @Column({ type: 'date', nullable: true })
  licenseExpiry: string;

  @Column({ type: 'enum', enum: DriverStatus, default: DriverStatus.ACTIVE })
  status: DriverStatus;

  @Column({ nullable: true })
  notes: string;
}
