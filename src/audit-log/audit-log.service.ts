import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/** Acciones registradas. Se nombran `dominio.hecho`, en pasado. */
export const AUDIT = {
  COMPANY_PLAN_CHANGED: 'company.plan_changed',
  COMPANY_STATUS_CHANGED: 'company.status_changed',
  COMPANY_ADDON_ADDED: 'company.addon_added',
  COMPANY_ADDON_REMOVED: 'company.addon_removed',
  BILLING_PERIOD_ISSUED: 'billing.period_issued',
  BILLING_PAYMENT_REGISTERED: 'billing.payment_registered',
  PLAN_UPDATED: 'plan.updated',
  IMPERSONATION_STARTED: 'superadmin.impersonation_started',
  SUPERADMIN_VIEWED_COMPANY: 'superadmin.viewed_company',
} as const;

export interface DatosAuditoria {
  action: string;
  /** Empresa afectada. `null` en acciones globales. */
  companyId?: string | null;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  isImpersonation?: boolean;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Registra una acción.
   *
   * **Nunca lanza.** Si la auditoría fallara y tumbara la operación, la
   * consecuencia sería peor que el registro perdido: el usuario no puede
   * trabajar. Se loguea el fallo y se sigue.
   *
   * Corre en contexto de sistema porque tiene que poder escribir filas sin
   * empresa (acciones globales del superadmin), que el filtrado por empresa
   * rechazaría.
   */
  async registrar(
    actor: ActiveUserInterface | null,
    datos: DatosAuditoria,
    request?: { ip?: string; headers?: Record<string, unknown> },
  ): Promise<void> {
    try {
      await runAsSystem(() =>
        this.repo.save(
          this.repo.create({
            actorUserId: actor?.id ?? null,
            actorEmail: (actor as { email?: string })?.email,
            actorRole: actor?.role,
            actorCompanyId: actor?.companyId ?? null,
            companyId: datos.companyId ?? null,
            action: datos.action,
            entityType: datos.entityType,
            entityId: datos.entityId ?? null,
            metadata: datos.metadata ?? null,
            isImpersonation: datos.isImpersonation ?? false,
            ip: request?.ip,
            userAgent: String(
              request?.headers?.['user-agent'] ?? '',
            ).slice(0, 300),
          }),
        ),
      );
    } catch (e) {
      this.logger.error(
        `No se pudo registrar la auditoría de "${datos.action}": ${String(e)}`,
      );
    }
  }

  /**
   * Consulta del registro.
   *
   * Un usuario de empresa **sólo ve lo de su empresa**, aunque pida otra: el
   * filtro no se toma del parámetro sino del token. Sólo el superadmin puede
   * consultar de forma transversal.
   */
  async listar(
    actor: ActiveUserInterface,
    filtros: { companyId?: string; action?: string; limit?: number } = {},
  ): Promise<AuditLog[]> {
    const esSuperadmin = actor.role === Role.SUPERADMIN;
    const limit = Math.min(filtros.limit ?? 100, 500);

    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .limit(limit);

    if (esSuperadmin) {
      if (filtros.companyId) {
        qb.andWhere('log.companyId = :companyId', {
          companyId: filtros.companyId,
        });
      }
    } else {
      // Se ignora `filtros.companyId` a propósito: pedir otra empresa no puede
      // devolver nada.
      qb.andWhere('log.companyId = :companyId', {
        companyId: actor.companyId,
      });
    }

    if (filtros.action) {
      qb.andWhere('log.action = :action', { action: filtros.action });
    }

    return runAsSystem(() => qb.getMany());
  }
}
