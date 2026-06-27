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
import { CertificationType } from 'src/common/enums/certificationType.enum';
import { CertificationStatus } from 'src/common/enums/certificationStatus.enum';
import { Employee } from './employee.entity';

@Entity('certifications')
export class Certification {
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

  @ManyToOne(() => Employee, (employee) => employee.certifications)
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'enum', enum: CertificationType })
  type: CertificationType;

  @Column({ nullable: true })
  class: string;

  @Column({ nullable: true })
  number: string;

  @Column({ nullable: true })
  issuedBy: string;

  @Column({ type: 'date', nullable: true })
  issueDate: string;

  @Column({ type: 'date', nullable: true })
  expiryDate: string;

  @Column({ nullable: true })
  fileKey: string;

  @Column({
    type: 'enum',
    enum: CertificationStatus,
    default: CertificationStatus.VALID,
  })
  status: CertificationStatus;

  @Column({ nullable: true })
  notes: string;
}
