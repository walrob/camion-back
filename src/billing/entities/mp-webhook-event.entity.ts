import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Aviso recibido de Mercado Pago.
 *
 * **No es un log: es el candado de idempotencia** (riesgo R9.2). MP reenvía el
 * mismo aviso hasta recibir un 200, y puede mandar dos copias a la vez. La fila
 * se inserta ANTES de procesar y el índice único `(type, resourceId)` hace que
 * la segunda copia falle en la base; recién ahí se sabe que ya se está
 * procesando y se descarta sin tocar nada.
 *
 * Es una entidad **global**, sin `companyId`: cuando el aviso llega todavía no
 * se sabe de qué empresa es —eso sale de consultar el pago en MP—, y el
 * webhook es público, así que no hay contexto de empresa que filtrar.
 */
@Entity('mp_webhook_events')
@Index(['type', 'resourceId'], { unique: true })
export class MpWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  /** `payment`, `preapproval`, `subscription_authorized_payment`… */
  @Column({ length: 64 })
  type: string;

  /** Identificador del recurso en MP (`data.id`). */
  @Column({ length: 64 })
  resourceId: string;

  /** Cuándo terminó de procesarse. NULL = quedó a medias. */
  @Column({ type: 'timestamp', nullable: true, default: null })
  processedAt: Date | null;

  /**
   * Error del procesamiento, si lo hubo.
   *
   * Un aviso que falló queda con `processedAt` en NULL y el motivo acá: es lo
   * que permite reprocesarlo a mano sin tener que pedirle a MP que lo reenvíe.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  /** Empresa a la que terminó imputándose, una vez resuelta. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId: string | null;
}
