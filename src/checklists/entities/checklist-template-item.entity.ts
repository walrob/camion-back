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
  ChecklistItemType,
} from 'src/common/enums/checklist.enum';
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

  /**
   * Bloque de la planilla en el que aparece el punto: «Estado del tractor»,
   * «Estado del equipo de frío». `null` = lista corrida, que es como venían
   * todas las plantillas hasta ahora.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  section: string | null;

  /**
   * Texto que se le muestra al chofer junto al punto: la advertencia, la
   * instrucción, el párrafo normativo que la empresa necesita tener a la vista.
   * Sin esto, esos textos terminan metidos a la fuerza dentro del `label`.
   */
  @Column({ type: 'text', nullable: true })
  helpText: string | null;

  /**
   * No todo lo que hay en una planilla es una inspección: hay declaraciones que
   * el chofer acepta, fotos que se piden siempre y campos de texto libre.
   */
  @Column({
    type: 'enum',
    enum: ChecklistItemType,
    default: ChecklistItemType.CONDITION,
  })
  type: ChecklistItemType;

  /**
   * Cuál es la respuesta que indica que está todo bien.
   *
   * «¿Están OK los zunchos?» espera SÍ; «¿tiene pérdidas de aceite?» espera NO.
   * Sin este dato, quien arma la plantilla está obligado a redactar cada
   * pregunta en positivo o la evaluación se invierte en silencio.
   */
  @Column({
    type: 'enum',
    enum: ChecklistAnswer,
    default: ChecklistAnswer.YES,
  })
  expectedAnswer: ChecklistAnswer;

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
   * Foto obligatoria **siempre**, salga como salga el punto.
   *
   * Distinto de `requiresPhotoOnFail`: hay empresas que piden la foto del
   * interior del furgón en cada salida, no sólo cuando algo está mal. Cuántas
   * exige lo decide cada una con `minPhotos`/`maxPhotos`.
   */
  @Column({ default: false })
  requiresPhoto: boolean;

  @Column({ type: 'int', default: 1 })
  minPhotos: number;

  /** Tope de adjuntos del punto. `null` = sin límite. */
  @Column({ type: 'int', nullable: true })
  maxPhotos: number | null;

  /**
   * Una respuesta que obliga a que Tráfico valide antes de liberar la unidad.
   *
   * No es lo mismo que `isCritical`: crítico es «este camión no sale», esto es
   * «este camión no sale **solo**, que lo mire alguien». La planilla RIP lo
   * pide para el acompañante y para cualquier condición declarada.
   */
  @Column({ default: false })
  requiresValidationOnFail: boolean;

  /**
   * Se desactiva, no se borra: los checklists ya firmados siguen mostrando el
   * ítem con el que se revisó la unidad ese día.
   */
  @Column({ default: true })
  isActive: boolean;
}
