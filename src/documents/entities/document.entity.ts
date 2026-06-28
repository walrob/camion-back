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
  DocumentCategory,
  DocumentOwnerType,
  DocumentStatus,
} from 'src/common/enums/document.enum';

@Entity('documents')
@Index(['ownerType', 'ownerId'])
export class Document {
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

  @Column({ type: 'enum', enum: DocumentOwnerType })
  ownerType: DocumentOwnerType;

  @Column({ nullable: true })
  ownerId: string;

  @Column({ type: 'enum', enum: DocumentCategory })
  category: DocumentCategory;

  @Column({ nullable: true })
  number: string;

  @Column({ type: 'date', nullable: true })
  issueDate: string;

  @Column({ type: 'date', nullable: true })
  expiryDate: string;

  @Column({ nullable: true })
  fileKey: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.VALID,
  })
  status: DocumentStatus;
}
