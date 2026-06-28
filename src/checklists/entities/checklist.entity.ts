import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChecklistResult } from 'src/common/enums/checklist.enum';
import { ChecklistItem } from './checklist-item.entity';

@Entity('checklists')
export class Checklist {
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
  tripId: string;

  @Column()
  truckId: string;

  @Column()
  driverId: string;

  @Column({
    type: 'enum',
    enum: ChecklistResult,
    default: ChecklistResult.PENDING,
  })
  result: ChecklistResult;

  @Column({ nullable: true })
  signatureKey: string;

  @Column({ type: 'timestamp', nullable: true })
  signedAt: Date;

  @OneToMany(() => ChecklistItem, (item) => item.checklist, { cascade: true })
  items: ChecklistItem[];
}
