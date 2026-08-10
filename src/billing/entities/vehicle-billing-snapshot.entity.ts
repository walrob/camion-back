import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';

/**
 * Foto diaria de las unidades de una empresa.
 *
 * La facturación se calcula sobre el **máximo de vehículos activos simultáneos
 * del mes** (MODELO-COMERCIAL §2.3), así que hay que observar el estado a lo
 * largo del período y no en un instante: si sólo se mirara el último día,
 * bastaría dar de baja las unidades el día 30 para no pagarlas.
 *
 * Se eligió una foto diaria en vez de un log de eventos porque es trivial de
 * auditar frente al cliente ("el día 12 tenías 14 camiones activos"), no exige
 * reconstruir estado, y una fila por empresa por día es volumen despreciable.
 */
@Entity('vehicle_billing_snapshots')
@Unique('UQ_vehicle_snapshots_company_date', ['companyId', 'date'])
export class VehicleBillingSnapshot extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'date' })
  date: Date;

  @Column('int', { default: 0 })
  activeTrucks: number;

  @Column('int', { default: 0 })
  inactiveTrucks: number;

  @Column('int', { default: 0 })
  activeTrailers: number;

  @Column('int', { default: 0 })
  inactiveTrailers: number;
}
