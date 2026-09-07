import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ChecklistResult } from 'src/common/enums/checklist.enum';
import { ChecklistItem } from './checklist-item.entity';
import { ChecklistCompanion } from './checklist-companion.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// clientId se scopea por empresa, igual que en oea_inspections y fuel_records.
@Entity('checklists')
@Unique('UQ_checklists_company_client', ['companyId', 'clientId'])
export class Checklist extends TenantEntity {
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

  /**
   * El furgón / semi con el que sale.
   *
   * Va aparte del tractor porque la planilla los identifica por separado: son
   * dos patentes y dos estados distintos, y el furgón puede cambiar sin que
   * cambie el tractor.
   */
  @Column({ nullable: true })
  trailerId: string;

  @Column()
  driverId: string;

  /**
   * Con qué plantilla se emitió, y con qué revisión de esa plantilla.
   *
   * Los ítems ya se copian; esto copia además la identidad del formulario. Es
   * lo que permite responder «¿qué revisión firmó el chofer ese día?» sin
   * suponer que es la vigente hoy.
   */
  @Column({ nullable: true })
  templateId: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  templateCode: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  templateRevision: string | null;

  /**
   * Si viaja con acompañante. `null` = la planilla no lo pregunta.
   *
   * El detalle de cada persona va en `companions`: la planilla admite más de
   * uno, y de cada uno hacen falta nombre, documento y si se pidió el seguro.
   */
  @Column({ type: 'boolean', nullable: true })
  hasCompanion: boolean | null;

  @Column({
    type: 'enum',
    enum: ChecklistResult,
    default: ChecklistResult.PENDING,
  })
  result: ChecklistResult;

  /** Observaciones generales del chofer, fuera de cualquier punto. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * Dónde se completó. Una planilla «previo al ingreso a cargar» que se firmó a
   * 200 km del cliente no es la misma planilla.
   */
  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lng: number | null;

  @Column({ nullable: true })
  signatureKey: string;

  @Column({ type: 'timestamp', nullable: true })
  signedAt: Date;

  // ─── Validación de Tráfico ───

  /**
   * Quién liberó la unidad, cuándo y con qué observación.
   *
   * La firma del chofer cierra la declaración; no la aprueba. Cuando la
   * planilla declara algo que requiere validación, queda en
   * `PENDING_VALIDATION` hasta que una persona de Tráfico la resuelve, y es
   * esa persona la que queda registrada acá.
   */
  @Column({ nullable: true })
  validatedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt: Date;

  @Column({ type: 'text', nullable: true })
  validationNotes: string | null;

  /** Idempotencia para la sincronización offline del chofer. */
  @Column({ nullable: true })
  clientId: string;

  @OneToMany(() => ChecklistItem, (item) => item.checklist, { cascade: true })
  items: ChecklistItem[];

  @OneToMany(() => ChecklistCompanion, (c) => c.checklist, { cascade: true })
  companions: ChecklistCompanion[];
}
