import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';
import { SubscriptionStatus } from 'src/common/enums/billing.enum';
import { LineaDetalle, UnidadesFacturables } from '../pricing.util';
import { Payment } from './payment.entity';

/** Foto de lo facturado. Sin esto, una disputa con el cliente es indefendible. */
export interface BilledUnitsSnapshot extends UnidadesFacturables {
  /** Camiones efectivamente facturados, ya aplicado el mínimo del plan. */
  billedTrucks: number;
  /** Unidades equivalentes resultantes. */
  billedUnits: number;
  /** Código y nombre del plan al momento de emitir. */
  planCode: string;
  planName: string;
  /** Precios usados. Se guardan para no depender del catálogo, que cambia. */
  baseFee: number;
  pricePerVehicle: number;
  /** Detalle legible de la factura. */
  lineas: LineaDetalle[];
}

/**
 * Un período facturable de una empresa: la obligación de pagar un mes.
 *
 * **Los importes se congelan acá.** No se guardan referencias al plan sino los
 * números con los que se emitió: si mañana sube la lista de precios, las
 * facturas ya emitidas no se reescriben (riesgo R5.4). Un período emitido no se
 * recalcula nunca; si estuvo mal, se anula (`VOID`) y se emite otro.
 */
@Entity('subscriptions')
@Index(['companyId', 'periodStart'])
// Un período, una sola factura (R9.1). Se declara acá además de en la migración
// para que los metadatos de TypeORM reflejen la base: si no, la próxima
// `migration:generate` propondría borrar el índice por considerarlo de más.
@Index(['companyId', 'periodKey'], { unique: true })
export class Subscription extends TenantEntity {
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

  // --- Período ---

  @Column({ type: 'date' })
  periodStart: Date;

  @Column({ type: 'date' })
  periodEnd: Date;

  /** Fecha límite de pago antes de pasar a vencido. */
  @Column({ type: 'date' })
  expiration: Date;

  // --- Importes (congelados al emitir) ---

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  baseAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  vehiclesAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  addonsAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  discount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column('simple-json', { nullable: true })
  billedUnits: BilledUnitsSnapshot;

  // --- Estado ---

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ISSUED,
  })
  status: SubscriptionStatus;

  @Column({ default: false })
  isPaid: boolean;

  @Column({ type: 'date', nullable: true })
  paidAt: Date | null;

  /** Comprobante en S3. */
  @Column({ nullable: true })
  invoiceUrl: string;

  /**
   * Cargo prorrateado por un cambio a mitad de período (más vehículos, upgrade
   * de plan o alta de add-on).
   *
   * **Comparte el `periodEnd` del período vigente, así que el cron de renovación
   * TIENE que excluirlo.** Si lo tomara como un período a renovar, emitiría una
   * factura completa de más por cada cambio hecho durante el mes. Es el bug más
   * caro de este dominio y ya lo documentó Aturna: no hay que redescubrirlo.
   */
  @Column({ default: false })
  isProrated: boolean;

  /**
   * Clave de unicidad del período, calculada por la base (R9.1).
   *
   * Vale `periodStart` para un período normal vigente y **NULL** para los
   * prorrateos, los anulados y los borrados. Sobre ella hay un índice único
   * `(companyId, periodKey)`, y como MySQL admite repetir NULL en un índice
   * único, el efecto es exactamente el que se busca:
   *
   *  - una empresa **no puede** tener dos veces el mismo período facturado, ni
   *    aunque el cron corra dos veces o se emita a mano en paralelo;
   *  - **sí puede** tener varios prorrateos el mismo día (un upgrade y un
   *    add-on son dos cargos legítimos con la misma fecha);
   *  - un período mal emitido se anula (`VOID`) y se vuelve a emitir, que es lo
   *    que dice el contrato de esta entidad.
   *
   * Está en la base y no sólo en el código porque una doble facturación es un
   * error que el cliente ve en su resumen: el chequeo previo de
   * `emitirPeriodo()` evita el caso normal, el índice evita el simultáneo.
   */
  @Column({
    type: 'date',
    nullable: true,
    select: false,
    insert: false,
    update: false,
    generatedType: 'STORED',
    asExpression:
      "(case when `isProrated` = 0 and `deletedAt` is null and `status` <> 'void' then `periodStart` else null end)",
  })
  periodKey: Date | null;

  @Column({ nullable: true })
  notes: string;

  @OneToMany(() => Payment, (p) => p.subscription)
  payments: Payment[];
}
