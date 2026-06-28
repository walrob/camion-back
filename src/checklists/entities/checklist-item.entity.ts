import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ChecklistItemKey,
  ChecklistItemStatus,
} from 'src/common/enums/checklist.enum';
import { Checklist } from './checklist.entity';

@Entity('checklist_items')
export class ChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  checklistId: string;

  @ManyToOne(() => Checklist, (checklist) => checklist.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'checklistId' })
  checklist: Checklist;

  @Column({ type: 'enum', enum: ChecklistItemKey })
  key: ChecklistItemKey;

  @Column()
  label: string;

  @Column({
    type: 'enum',
    enum: ChecklistItemStatus,
    default: ChecklistItemStatus.NA,
  })
  status: ChecklistItemStatus;

  @Column({ nullable: true })
  notes: string;
}
