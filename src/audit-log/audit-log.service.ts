import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { runAsSystem } from 'src/common/tenant/tenant-context';
import { Pagination } from 'nestjs-typeorm-paginate';
import {
  leerPaginacion,
  metaDePaginacion,
} from 'src/common/utils/meta-paginacion.util';

/** Acciones registradas. Se nombran `dominio.hecho`, en pasado. */
export const AUDIT = {
  COMPANY_PLAN_CHANGED: 'company.plan_changed',
  COMPANY_STATUS_CHANGED: 'company.status_changed',
  COMPANY_ADDON_ADDED: 'company.addon_added',
  COMPANY_ADDON_REMOVED: 'company.addon_removed',
  BILLING_PERIOD_ISSUED: 'billing.period_issued',
  BILLING_PAYMENT_REGISTERED: 'billing.payment_registered',
  /** Ciclo de mora (fase 9). El actor es el cron: se registra sin usuario. */
  BILLING_COMPANY_DEFAULTED: 'billing.company_defaulted',
  BILLING_COMPANY_BLOCKED: 'billing.company_blocked',
  BILLING_COMPANY_REGULARIZED: 'billing.company_regularized',
  /** Cobro automático por Mercado Pago. */
  MP_PAYMENT_RECEIVED: 'mp.payment_received',
  MP_SUBSCRIPTION_CHANGED: 'mp.subscription_changed',
  /** Reproceso manual de un aviso que había fallado. */
  MP_EVENT_RETRIED: 'mp.event_retried',
  PLAN_UPDATED: 'plan.updated',
  /**
   * Reaperturas: alguien revirtió un cierre. Son las acciones que contestan
   * "¿por qué esto que estaba cerrado volvió a estar abierto?", así que van
   * siempre con el motivo en `metadata`.
   */
  INCIDENT_REOPENED: 'incident.reopened',
  ALERT_REOPENED: 'alert.reopened',
  MAINTENANCE_ORDER_REOPENED: 'maintenance.order_reopened',
  SETTLEMENT_REOPENED: 'settlement.reopened',
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
    filtros: {
      companyId?: string;
      action?: string;
      search?: string;
      desde?: string;
      hasta?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<Pagination<AuditLog>> {
    const esSuperadmin = actor.role === Role.SUPERADMIN;
    const { page, limit, offset } = leerPaginacion(filtros.page, filtros.limit, 50);

    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC');

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

    if (filtros.search) {
      qb.andWhere(
        '(LOWER(log.actorEmail) LIKE LOWER(:q) OR log.entityId LIKE :q ' +
          'OR LOWER(log.entityType) LIKE LOWER(:q))',
        { q: `%${filtros.search}%` },
      );
    }

    if (filtros.desde) {
      qb.andWhere('log.createdAt >= :desde', { desde: filtros.desde });
    }
    if (filtros.hasta) {
      // Inclusivo: quien pide "hasta el 14" espera que entre lo del 14.
      qb.andWhere('log.createdAt < DATE_ADD(:hasta, INTERVAL 1 DAY)', {
        hasta: filtros.hasta,
      });
    }

    return runAsSystem(async () => {
      const total = await qb.getCount();
      const items = await qb.limit(limit).offset(offset).getMany();

      return {
        items,
        meta: metaDePaginacion(total, items.length, page, limit),
      } as Pagination<AuditLog>;
    });
  }

  /**
   * Acciones distintas que hay registradas, para poblar el filtro.
   *
   * Sale de la base y no de la constante `AUDIT` a propósito: lo que interesa
   * filtrar es lo que efectivamente pasó, y una acción vieja que ya no se
   * emite igual está en el histórico.
   */
  async accionesRegistradas(actor: ActiveUserInterface): Promise<string[]> {
    const qb = this.repo
      .createQueryBuilder('log')
      .select('DISTINCT log.action', 'action')
      .orderBy('log.action', 'ASC');

    if (actor.role !== Role.SUPERADMIN) {
      qb.where('log.companyId = :companyId', { companyId: actor.companyId });
    }

    const filas = await runAsSystem(() => qb.getRawMany<{ action: string }>());
    return filas.map((f) => f.action);
  }
}
