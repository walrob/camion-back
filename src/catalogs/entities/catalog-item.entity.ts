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
 * Un elemento de un catálogo de negocio de la empresa: un tipo de gasto, un
 * tipo de incidente, una categoría de documento (docs/CONFIGURACION.md §5).
 *
 * Sólo existen filas para los catálogos que la empresa **tocó**: mientras no
 * edite ninguno, se usan los elementos de sistema definidos en el código.
 */
@Entity('catalog_items')
@Unique('UQ_catalog_items_company_catalog_key', ['companyId', 'catalog', 'key'])
export class CatalogItem extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  updatedBy: string;

  /** A qué catálogo pertenece (`expense_type`, `incident_type`, …). */
  @Column({ length: 40 })
  catalog: string;

  /**
   * Clave estable. El código compara contra esto, nunca contra `label`
   * (docs/CONFIGURACION.md §2.2).
   */
  @Column({ length: 64 })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  icon: string | null;

  @Column({ type: 'int', default: 0 })
  order: number;

  /**
   * Comportamiento que el código entiende, en los catálogos que lo usan.
   *
   * Hoy sólo `expense_type`: `advance` **resta** en la rendición y `expense`
   * suma. Es un conjunto cerrado, no texto libre: sin esto, una empresa que
   * agrega «Adelanto por transferencia» tendría un adelanto contado como gasto
   * y una rendición mal calculada, que es peor que no poder crearlo.
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  behavior: string | null;

  /** Se desactiva, no se borra: el histórico sigue resolviendo su etiqueta. */
  @Column({ default: true })
  isActive: boolean;
}
