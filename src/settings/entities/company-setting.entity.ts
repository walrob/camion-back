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
 * Ajuste de operación de una empresa (key/value).
 *
 * Sólo existen filas para lo que la empresa **cambió**: el valor por defecto
 * vive en el código (`settings.catalog.ts`), así que una empresa nueva opera sin
 * una sola fila acá. La configuración es un override, no un requisito de alta
 * (docs/CONFIGURACION.md §2.1).
 *
 * El valor se guarda siempre como texto y lo interpreta el servicio según el
 * tipo declarado en el catálogo: una tabla con columnas por tipo obligaría a
 * migrar el esquema cada vez que se agrega un ajuste.
 */
@Entity('company_settings')
@Unique('UQ_company_settings_company_key', ['companyId', 'key'])
export class CompanySetting extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  updatedBy: string;

  @Column()
  key: string;

  @Column({ type: 'text' })
  value: string;
}
