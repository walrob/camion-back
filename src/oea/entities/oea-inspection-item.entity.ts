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
import { TenantEntity } from 'src/common/entities/tenant.entity';

@Entity('oea_inspection_items')
export class OeaInspectionItem extends TenantEntity {
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

  /**
   * Clave del punto revisado. Texto y no enum: la empresa puede sumar puntos
   * propios a su planilla (docs/CONFIGURACION.md §6.2). Los 7 de la norma
   * siguen siendo constantes del código.
   */
  @Column({ length: 64 })
  key: string;

  @Column({ length: 40 })
  section: string;

  @Column()
  label: string;

  @Column({ type: 'enum', enum: OeaItemStatus, default: OeaItemStatus.NA })
  status: OeaItemStatus;

  @Column({ nullable: true })
  notes: string;
}
