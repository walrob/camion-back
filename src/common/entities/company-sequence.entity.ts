import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from './tenant.entity';

/** Claves de secuencia conocidas. */
export enum SequenceKey {
  TRIP = 'trip',
  INCIDENT = 'incident',
}

/**
 * Contador correlativo por empresa, usado para generar los códigos visibles
 * (`V-00001`, `INC-00001`).
 *
 * Reemplaza al `repository.count()` que se usaba antes, que tenía dos defectos:
 * contaba de forma global (con multi-empresa habría mezclado numeraciones) y
 * era propenso a colisiones, porque dos altas simultáneas leían el mismo total
 * y porque los borrados lógicos hacían que el contador retrocediera y repitiera
 * un código ya emitido.
 *
 * El incremento se hace con `SELECT ... FOR UPDATE` dentro de la transacción del
 * alta, así que dos altas simultáneas se serializan.
 */
@Entity('company_sequences')
@Unique('UQ_company_sequences_company_key', ['companyId', 'key'])
export class CompanySequence extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Qué numeración: 'trip' | 'incident'. */
  @Column()
  key: string;

  /** Último valor emitido. El próximo código usa `lastValue + 1`. */
  @Column('int', { default: 0 })
  lastValue: number;
}
