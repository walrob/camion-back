import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Qué se hizo. Cadena libre con prefijo de dominio: `company.plan_changed`. */
export type AuditAction = string;

/**
 * Registro inmutable de acciones sensibles.
 *
 * Cumple dos funciones:
 *
 *  1. **Control del superadmin**: es lo que hace defendible que exista un rol
 *     con acceso entre empresas. Sin registro, ese acceso sería una puerta sin
 *     cerradura (riesgo R8.1).
 *  2. **Trazabilidad para el cliente**: sostiene la promesa comercial de
 *     "Rol Auditor y trazabilidad de cambios" del plan Gestión (§4.1).
 *
 * **No lleva `companyId` obligatorio ni hereda de `TenantEntity`** a propósito:
 * tiene que poder registrar acciones globales del superadmin, que no pertenecen
 * a ninguna empresa. El filtrado por empresa lo hace el servicio de forma
 * explícita según quién consulta.
 *
 * Nunca se actualiza ni se borra: sólo se inserta. Un registro de auditoría
 * editable no sirve para auditar nada.
 */
@Entity('audit_logs')
@Index(['companyId', 'createdAt'])
@Index(['actorUserId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  // ── Quién ────────────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  /** Se guarda el email además del id: si el usuario se borra, el rastro queda. */
  @Column({ nullable: true })
  actorEmail: string;

  @Column({ nullable: true })
  actorRole: string;

  /** Empresa del actor. NULL cuando es el superadmin. */
  @Column({ type: 'uuid', nullable: true })
  actorCompanyId: string | null;

  // ── Sobre qué ────────────────────────────────────────────────────────────

  /** Empresa afectada. NULL en acciones globales (ABM de planes, por ejemplo). */
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Column()
  action: AuditAction;

  @Column({ nullable: true })
  entityType: string;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  /** Detalle: valores anteriores y nuevos, motivo, lo que haga falta. */
  @Column('simple-json', { nullable: true })
  metadata: Record<string, unknown> | null;

  // ── Contexto ─────────────────────────────────────────────────────────────

  @Column({ nullable: true })
  ip: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  userAgent: string;

  /**
   * La acción se hizo suplantando a un usuario del cliente.
   * Es lo primero que se mira cuando alguien pregunta "¿quién tocó esto?".
   */
  @Column({ default: false })
  isImpersonation: boolean;
}
