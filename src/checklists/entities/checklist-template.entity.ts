import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';
import { ChecklistTemplateItem } from './checklist-template-item.entity';

/**
 * Plantilla de checklist pre-viaje de una empresa.
 *
 * Mientras no exista ninguna, el sistema usa `DEFAULT_CHECKLIST_ITEMS`: una
 * empresa que no configura nada revisa los siete ítems de siempre
 * (docs/CONFIGURACION.md §6.1).
 *
 * `vehicleType` permite tener una plantilla por tipo de unidad —un tractor con
 * cisterna no se revisa como un furgón—. La plantilla sin tipo es la general y
 * se usa cuando no hay una específica para ese camión.
 */
@Entity('checklist_templates')
export class ChecklistTemplate extends TenantEntity {
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

  @Column()
  name: string;

  /**
   * Código del formulario en el sistema documental de la empresa: «RIP 06 09
   * 01». Quien opera bajo OEA no llama a su planilla «Checklist general», la
   * llama por su código, y es por ese código que se la pide una auditoría.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  code: string | null;

  /**
   * Revisión vigente del formulario: «REV.04», con su fecha.
   *
   * Cada checklist emitido se lleva una copia de estos tres campos. Sin eso,
   * ante «mostrame la revisión del formulario que firmó el chofer ese día» la
   * única respuesta posible es la revisión de hoy, que puede no ser la misma.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  revision: string | null;

  @Column({ type: 'date', nullable: true })
  revisionDate: Date | null;

  /**
   * Tipo de camión al que aplica. `null` = plantilla general de la empresa.
   *
   * El tipo va explícito: con la unión `string | null`, TypeORM infiere
   * `Object` y MySQL no sabe qué columna crear.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  vehicleType: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ChecklistTemplateItem, (item) => item.template, {
    cascade: ['insert'],
  })
  items: ChecklistTemplateItem[];
}
