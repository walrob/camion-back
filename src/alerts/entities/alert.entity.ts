import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AlertLevel,
  AlertSourceType,
  AlertStatus,
} from 'src/common/enums/alert.enum';

@Entity('alerts')
@Index(['status'])
@Index(['level'])
export class Alert {
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

  @Column({ type: 'enum', enum: AlertLevel })
  level: AlertLevel;

  @Column({ type: 'enum', enum: AlertSourceType })
  sourceType: AlertSourceType;

  @Column({ nullable: true })
  sourceId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.NEW })
  status: AlertStatus;

  @Column({ type: 'simple-array', nullable: true })
  targetRoles: string[];
}
