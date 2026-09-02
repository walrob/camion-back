import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';

/**
 * Cotización de una moneda contra la **moneda base de la empresa**, para una
 * fecha (docs/CONFIGURACION.md §7.2).
 *
 * `rate` es cuántas unidades de la moneda base vale UNA unidad de `code`: con
 * base ARS y `USD = 1150`, un peaje de 10 USD son 11.500 pesos.
 *
 * Se guarda por fecha y no como "la cotización actual" porque un movimiento se
 * convierte con la del día en que ocurrió, no con la de hoy.
 */
@Entity('exchange_rates')
@Unique('UQ_exchange_rates_company_code_date', ['companyId', 'code', 'date'])
@Index('IDX_exchange_rates_company_code_date', ['companyId', 'code', 'date'])
export class ExchangeRate extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ length: 3 })
  code: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  rate: number;

  /** `manual` la carga la oficina; `api`, una integración futura. */
  @Column({ length: 20, default: 'manual' })
  source: string;
}
