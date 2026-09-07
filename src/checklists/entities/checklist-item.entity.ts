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
  ChecklistAnswer,
  ChecklistItemStatus,
  ChecklistItemType,
} from 'src/common/enums/checklist.enum';
import { Checklist } from './checklist.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

@Entity('checklist_items')
export class ChecklistItem extends TenantEntity {
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

  /**
   * Clave del punto revisado. Texto y no enum de base: la empresa arma su
   * propia plantilla y puede sumar ítems que el código no conoce
   * (docs/CONFIGURACION.md §2.2).
   */
  @Column({ length: 64 })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  section: string | null;

  @Column({ type: 'text', nullable: true })
  helpText: string | null;

  @Column({ type: 'int', default: 0 })
  order: number;

  /**
   * Se copian de la plantilla al crear el checklist, no se leen de ella.
   *
   * Si mañana la empresa deja de considerar crítico el matafuego, el checklist
   * que se rechazó por eso tiene que seguir explicando por qué se rechazó.
   */
  @Column({ default: false })
  isCritical: boolean;

  @Column({ default: false })
  requiresPhotoOnFail: boolean;

  @Column({ default: false })
  requiresPhoto: boolean;

  @Column({ type: 'int', default: 1 })
  minPhotos: number;

  @Column({ type: 'int', nullable: true })
  maxPhotos: number | null;

  @Column({ default: false })
  requiresValidationOnFail: boolean;

  @Column({
    type: 'enum',
    enum: ChecklistItemType,
    default: ChecklistItemType.CONDITION,
  })
  type: ChecklistItemType;

  @Column({
    type: 'enum',
    enum: ChecklistAnswer,
    default: ChecklistAnswer.YES,
  })
  expectedAnswer: ChecklistAnswer;

  /**
   * Lo que el chofer contestó, tal cual. `status` es la lectura de esa
   * respuesta contra `expectedAnswer`, y la hace el servidor.
   *
   * Se guardan las dos porque responden preguntas distintas: ante un reclamo,
   * «el chofer declaró que la unidad tenía pérdidas» no es lo mismo que «el
   * punto figuraba como no conforme».
   */
  @Column({ type: 'enum', enum: ChecklistAnswer, nullable: true })
  answer: ChecklistAnswer | null;

  @Column({
    type: 'enum',
    enum: ChecklistItemStatus,
    default: ChecklistItemStatus.NA,
  })
  status: ChecklistItemStatus;

  @Column({ nullable: true })
  notes: string;
}
