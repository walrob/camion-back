import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';

/**
 * Punto **propio** que la empresa suma a su planilla OEA
 * (docs/CONFIGURACION.md §6.2).
 *
 * Los 7 puntos AFIP y los precintos NO viven acá: son un piso normativo
 * (`DEFAULT_OEA_ITEMS`) que no se edita ni se desactiva. Lo que una empresa
 * necesita es **agregar** lo suyo —una faja propia, el control de temperatura de
 * un furgón refrigerado— sin que eso toque la parte que la norma exige.
 */
@Entity('oea_template_items')
@Unique('UQ_oea_template_items_company_key', ['companyId', 'key'])
export class OeaTemplateItem extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  updatedBy: string;

  @Column({ length: 64 })
  key: string;

  @Column()
  label: string;

  /** En qué bloque de la planilla aparece: inspección física o dispositivos. */
  @Column({ length: 40 })
  section: string;

  @Column({ type: 'int', default: 0 })
  order: number;

  /** Se desactiva, no se borra: las planillas firmadas lo siguen nombrando. */
  @Column({ default: true })
  isActive: boolean;
}
