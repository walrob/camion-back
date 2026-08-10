import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';
import { Addon } from './addon.entity';

/**
 * Add-on contratado por una empresa.
 *
 * `endedAt` marca la baja efectiva y `scheduledEndAt` la baja pedida pero aún no
 * aplicada: igual que con los planes, dar de baja un add-on rige desde la
 * renovación y no en el acto (MODELO-COMERCIAL §6.4), para que nadie contrate y
 * cancele dentro del mismo período.
 */
@Entity('company_addons')
export class CompanyAddon extends TenantEntity {
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

  @ManyToOne(() => Addon, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'addonId' })
  addon: Addon;

  @Column({ type: 'uuid' })
  addonId: string;

  /** Para add-ons que se contratan por cantidad. */
  @Column('int', { default: 1 })
  quantity: number;

  @Column({ type: 'date' })
  startedAt: Date;

  /** Baja efectiva. NULL = vigente. */
  @Column({ type: 'date', nullable: true })
  endedAt: Date | null;

  /** Baja pedida, a aplicar en la próxima renovación. */
  @Column({ type: 'date', nullable: true })
  scheduledEndAt: Date | null;
}
