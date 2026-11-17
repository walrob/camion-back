import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';
import { EngagementSegment } from '../engagement.rules';

/**
 * Un email de activación o re-enganche enviado.
 *
 * El índice único es lo que garantiza que el mismo paso no le llegue dos veces
 * a la misma persona, aunque el cron corra dos veces o haya dos instancias del
 * back. Incluye la empresa porque así lo exige el aislamiento
 * (`tenant-entities.spec.ts`), y es lo correcto: si un usuario pasa a otra
 * empresa, la puesta en marcha de esa empresa empieza de cero.
 *
 * Es de empresa (`TenantEntity`): con `companyId` se mide la activación
 * posterior, que es de la empresa y no de la persona. El cron lo escribe sin
 * request, con la empresa explícita, que es lo que el `TenantSubscriber` exige.
 */
@Entity('email_log')
@Index(['companyId', 'userId', 'segment', 'step'], { unique: true })
export class EmailLog extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'enum', enum: EngagementSegment })
  segment: EngagementSegment;

  /** 1, 2 o 3 según el umbral de la secuencia (C tiene uno solo). */
  @Column({ type: 'int' })
  step: number;

  @Index()
  @CreateDateColumn()
  sentAt: Date;

  /** Primer clic en el botón del email. */
  @Column({ type: 'timestamp', nullable: true })
  clickAt: Date | null;

  /**
   * A dónde lleva el botón, ya con los UTM. El link del email apunta al back
   * con el id de esta fila y el back redirige acá: así se registra el clic sin
   * abrir una redirección a cualquier URL.
   */
  @Column({ type: 'text' })
  targetUrl: string;
}
