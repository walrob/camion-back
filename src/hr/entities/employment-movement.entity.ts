import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  EmploymentMovementType,
  LeaveType,
} from 'src/common/enums/employmentMovement.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { Employee } from './employee.entity';

/**
 * Un asiento del legajo laboral: ingreso, licencia, suspensión, reincorporación
 * o baja. El conjunto de movimientos de un empleado es el historial completo y
 * determina su `employmentStatus` actual (ver `EmploymentMovementsService`).
 */
@Entity('employment_movements')
@Index(['employeeId', 'startDate'])
export class EmploymentMovement {
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

  @ManyToOne(() => Employee, (employee) => employee.movements)
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'enum', enum: EmploymentMovementType })
  type: EmploymentMovementType;

  /** Motivo de la licencia. Solo se completa cuando `type` es LEAVE. */
  @Column({ type: 'enum', enum: LeaveType, nullable: true })
  leaveType: LeaveType | null;

  /** Desde cuándo rige el movimiento. */
  @Column({ type: 'date' })
  startDate: string;

  /**
   * Hasta cuándo rige (inclusive). Solo para licencias y suspensiones; `null`
   * significa que sigue abierta / sin fecha de fin definida.
   */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  /**
   * Estado que impone el movimiento mientras está vigente. Se deriva del `type`
   * al guardar; se persiste para que el historial siga siendo legible aunque
   * después cambie el mapeo.
   */
  @Column({ type: 'enum', enum: EmploymentStatus })
  resultingStatus: EmploymentStatus;

  /** Motivo/descripción libre (ej. "suspensión por 3 días - art. 218"). */
  @Column({ nullable: true })
  reason: string;

  /** Adjunto respaldatorio (certificado médico, telegrama, acta). */
  @Column({ nullable: true })
  fileKey: string;

  @Column({ nullable: true })
  notes: string;
}
