import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';
import { ChecklistTemplate } from './checklist-template.entity';

/**
 * Un punto a revisar dentro de una plantilla.
 *
 * `key` es la clave estable —el código y el histórico se apoyan en ella— y
 * `label` es lo que lee el chofer, que la empresa puede cambiar cuando quiera
 * (docs/CONFIGURACION.md §2.2). Por eso `key` dejó de ser un enum de base de
 * datos: una empresa que agrega «Cadenas de nieve» no puede exigir una
 * migración de esquema.
 */
@Entity('checklist_template_items')
export class ChecklistTemplateItem extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  templateId: string;

  @ManyToOne(() => ChecklistTemplate, (template) => template.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'templateId' })
  template: ChecklistTemplate;

  @Column({ length: 64 })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'int', default: 0 })
  order: number;

  /**
   * Un ítem crítico en `Falla` **rechaza** el checklist: es la diferencia entre
   * «anotá que la luz de posición no anda» y «este camión no sale».
   */
  @Column({ default: false })
  isCritical: boolean;

  /** Si falla, el chofer tiene que adjuntar la foto antes de firmar. */
  @Column({ default: false })
  requiresPhotoOnFail: boolean;

  /**
   * Se desactiva, no se borra: los checklists ya firmados siguen mostrando el
   * ítem con el que se revisó la unidad ese día.
   */
  @Column({ default: true })
  isActive: boolean;
}
