import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AttachmentKind } from 'src/common/enums/attachmentKind.enum';

/**
 * Adjunto polimórfico reutilizable: se asocia a cualquier entidad del sistema
 * (bitácora, incidentes, checklist, mantenimiento, documentos, RRHH…) mediante
 * el par (entityType, entityId). El archivo vive en S3; aquí guardamos la key.
 */
@Entity('attachments')
@Index(['entityType', 'entityId'])
export class Attachment {
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
  entityType: string;

  @Column()
  entityId: string;

  @Column({ type: 'enum', enum: AttachmentKind })
  kind: AttachmentKind;

  @Column()
  s3Key: string;

  @Column()
  mime: string;

  @Column({ type: 'int', default: 0 })
  sizeBytes: number;

  @Column({ nullable: true })
  uploadedBy: string;
}
