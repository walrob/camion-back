import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { User } from 'src/users/entities/user.entity';
import { Certification } from './certification.entity';
import { TruckAssignment } from './truck-assignment.entity';
import { EmploymentMovement } from './employment-movement.entity';

@Entity('employees')
export class Employee {
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

  @Column({ nullable: true })
  userId: string;

  @OneToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  documentId: string;

  @Column({ type: 'date', nullable: true })
  birthDate: string;

  @Column({
    type: 'enum',
    enum: EmployeePosition,
    default: EmployeePosition.DRIVER,
  })
  position: EmployeePosition;

  @Column({ type: 'date', nullable: true })
  hireDate: string;

  /** Derivado del último movimiento de baja; `null` mientras no esté dado de baja. */
  @Column({ type: 'date', nullable: true })
  terminationDate: string | null;

  /**
   * Estado actual del legajo. Es un valor **derivado**: lo recalcula
   * `EmploymentMovementsService` a partir de `movements`. No editarlo a mano.
   */
  @Column({
    type: 'enum',
    enum: EmploymentStatus,
    default: EmploymentStatus.ACTIVE,
  })
  employmentStatus: EmploymentStatus;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  emergencyContactName: string;

  @Column({ nullable: true })
  emergencyContactPhone: string;

  @Column({ nullable: true })
  photoKey: string;

  @Column({ nullable: true })
  notes: string;

  @OneToMany(() => Certification, (cert) => cert.employee)
  certifications: Certification[];

  @OneToMany(() => TruckAssignment, (a) => a.employee)
  assignments: TruckAssignment[];

  /** Historial laboral: ingreso, licencias, suspensiones, baja. */
  @OneToMany(() => EmploymentMovement, (m) => m.employee)
  movements: EmploymentMovement[];
}
