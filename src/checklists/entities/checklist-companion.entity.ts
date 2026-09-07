import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Checklist } from './checklist.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

/**
 * Persona que viaja con el chofer.
 *
 * Es una entidad y no un par de columnas en el checklist porque la planilla
 * admite más de un acompañante y de cada uno hay que poder decir, por separado,
 * si se pidió el seguro y quién lo autorizó. El DNI se adjunta con el módulo de
 * attachments contra `entityType = 'checklist_companion'`.
 */
@Entity('checklist_companions')
export class ChecklistCompanion extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  checklistId: string;

  @ManyToOne(() => Checklist, (checklist) => checklist.companions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'checklistId' })
  checklist: Checklist;

  /**
   * Legajo de la persona, cuando ya está en el sistema.
   *
   * Un chofer que viaja de acompañante de otro no necesita que le vuelvan a
   * cargar el DNI: su nombre y su documento ya están en RRHH, y su foto de DNI
   * en el centro documental. Con esto cargado, `fullName` y `document` se
   * copian del legajo y la app deja de pedir la foto.
   *
   * `null` es el caso normal de un acompañante que no trabaja en la empresa
   * —un familiar—: ahí los datos se tipean y el DNI se adjunta.
   */
  @Column({ nullable: true })
  employeeId: string;

  /**
   * Si al declararlo su DNI ya estaba cargado en el sistema.
   *
   * Es una foto del momento y no un cálculo en vivo: la planilla firmada tiene
   * que poder decir que el documento estaba, aunque después alguien lo borre
   * del legajo.
   */
  @Column({ default: false })
  idDocumentOnFile: boolean;

  /**
   * Copiados del legajo cuando viene `employeeId`. Copia y no referencia: la
   * planilla firmada tiene que seguir diciendo quién viajó ese día, aunque la
   * persona después cambie de apellido o se dé de baja.
   */
  @Column()
  fullName: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  document: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  relationship: string | null;

  /**
   * Si el chofer declara haber pedido el seguro a su operador de tráfico.
   *
   * Es una declaración del chofer, no una confirmación de la empresa: quien
   * confirma es Tráfico, al validar la planilla.
   */
  @Column({ default: false })
  insuranceRequested: boolean;

  @Column({ nullable: true })
  authorizedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  authorizedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
