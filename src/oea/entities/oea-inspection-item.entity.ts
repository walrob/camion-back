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
  OeaItemKey,
  OeaItemStatus,
  OeaSection,
} from 'src/common/enums/oea.enum';
import { OeaInspection } from './oea-inspection.entity';

@Entity('oea_inspection_items')
export class OeaInspectionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  inspectionId: string;

  @ManyToOne(() => OeaInspection, (inspection) => inspection.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'inspectionId' })
  inspection: OeaInspection;

  @Column({ type: 'enum', enum: OeaItemKey })
  key: OeaItemKey;

  @Column({ type: 'enum', enum: OeaSection })
  section: OeaSection;

  @Column()
  label: string;

  @Column({ type: 'enum', enum: OeaItemStatus, default: OeaItemStatus.NA })
  status: OeaItemStatus;

  @Column({ nullable: true })
  notes: string;
}
