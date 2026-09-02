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
 * Una moneda habilitada para la empresa (docs/CONFIGURACION.md §7).
 *
 * Mientras no haya ninguna fila, la empresa opera **sólo en su moneda base**
 * —la del ajuste `locale.baseCurrency`, por defecto ARS— y las pantallas ni
 * siquiera muestran el selector de moneda: quien no cruza la frontera no se
 * entera de que esto existe.
 */
@Entity('company_currencies')
@Unique('UQ_company_currencies_company_code', ['companyId', 'code'])
export class CompanyCurrency extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  updatedBy: string;

  /** ISO 4217: ARS, USD, BRL, PYG, CLP, UYU… */
  @Column({ length: 3 })
  code: string;

  @Column({ length: 8 })
  symbol: string;

  /**
   * Decimales con los que se muestra. El guaraní y el peso chileno no llevan:
   * mostrar «₲ 1.500,00» delata que el sistema no entiende la moneda.
   */
  @Column({ type: 'int', default: 2 })
  decimals: number;

  @Column({ default: true })
  isActive: boolean;
}
