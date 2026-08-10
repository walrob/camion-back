import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  EntityMetadata,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { getCurrentCompanyId, isSystemContext } from './tenant-context';

/**
 * Red de seguridad del aislamiento entre empresas.
 *
 * Es la capa que hace que el aislamiento NO dependa de la disciplina de quien
 * escribe cada servicio:
 *
 *  - `beforeInsert`: estampa la empresa del contexto. Ninguna fila puede nacer
 *    huérfana ni en otra empresa.
 *  - `beforeUpdate`: impide mover una fila de una empresa a otra.
 *  - `afterLoad`: si una consulta devolvió una fila ajena, alguien se olvidó de
 *    filtrar. Se lanza una excepción en lugar de devolver el dato: preferimos un
 *    error ruidoso a una fuga silenciosa.
 *
 * Sólo actúa sobre entidades que tienen `companyId`. El catálogo global
 * (`Company`, `Plan`) queda fuera por no tener esa columna.
 */
@Injectable()
@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(TenantSubscriber.name);

  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  /** Sólo las entidades de empresa tienen la columna `companyId`. */
  private esDeEmpresa(metadata: EntityMetadata): boolean {
    return metadata.columns.some((c) => c.propertyName === 'companyId');
  }

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    if (!this.esDeEmpresa(event.metadata)) return;

    const entity = event.entity;
    if (!entity) return;

    const contexto = getCurrentCompanyId();

    if (!contexto) {
      // Sin contexto (arranque, seeders, crons) se exige que la empresa venga
      // escrita de forma explícita. Es una decisión deliberada del programador,
      // no un descuido, y sigue haciendo imposible una fila huérfana.
      if (!entity.companyId) {
        throw new ForbiddenException(
          `No se puede crear ${event.metadata.name} sin empresa: no hay ` +
            'contexto de request y tampoco se indicó companyId. Si es una ' +
            'operación de sistema, envolvela en runAsCompany().',
        );
      }
      return;
    }

    if (entity.companyId && entity.companyId !== contexto) {
      throw new ForbiddenException(
        `Intento de crear ${event.metadata.name} en otra empresa.`,
      );
    }

    entity.companyId = contexto;
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    if (!this.esDeEmpresa(event.metadata)) return;
    if (isSystemContext()) return;

    const contexto = getCurrentCompanyId();
    const entity = event.entity;
    if (!contexto || !entity?.companyId) return;

    if (entity.companyId !== contexto) {
      throw new ForbiddenException(
        `Intento de modificar ${event.metadata.name} de otra empresa.`,
      );
    }
  }

  /**
   * Tripwire. Si esto salta en producción es un bug de aislamiento: hay una
   * consulta que no filtra por empresa.
   *
   * Se deja **siempre activo**, también en producción: es la única defensa que
   * no depende de que nadie se olvide. El costo por fila es una comparación de
   * strings; la medición está en `contadores` para poder confirmarlo con datos
   * reales en vez de suponerlo.
   */
  afterLoad(entity: Record<string, unknown>): void {
    TenantSubscriber.filasVerificadas++;

    if (isSystemContext()) return;

    const contexto = getCurrentCompanyId();
    // Sin contexto no hay con qué comparar: pasa en el login, donde se busca al
    // usuario por email antes de saber a qué empresa pertenece.
    if (!contexto || !entity?.companyId) return;

    if (entity.companyId !== contexto) {
      TenantSubscriber.fugasDetectadas++;
      this.alertar(String(entity.companyId), contexto);
      throw new ForbiddenException('Acceso a datos de otra empresa.');
    }
  }

  /**
   * Deja el rastro para que la fuga se pueda monitorear.
   *
   * Emite un log de nivel `error` con un prefijo estable y buscable
   * (`TENANT_LEAK`) para poder configurar una alerta sobre él, y expone un
   * contador para el endpoint de salud. No se envía nada por red desde acá: el
   * subscriber corre dentro de la consulta y no puede depender de un servicio
   * externo que podría estar caído justo cuando más hace falta.
   */
  private alertar(companyIdAjeno: string, contexto: string): void {
    this.logger.error(
      `TENANT_LEAK — se leyó una fila de la empresa ${companyIdAjeno} ` +
        `estando en contexto de ${contexto}. Hay una consulta sin filtrar. ` +
        `Ocurrencias desde el arranque: ${TenantSubscriber.fugasDetectadas}.`,
    );
  }

  // ── Instrumentación ────────────────────────────────────────────────────────
  // Estáticos porque el subscriber se instancia una vez por DataSource y los
  // contadores tienen que sobrevivir a cualquier alcance de inyección.

  private static filasVerificadas = 0;
  private static fugasDetectadas = 0;

  /**
   * Métricas del tripwire, para el endpoint de salud y para medir su costo.
   *
   * `fugas > 0` en producción es un incidente, no una métrica: significa que
   * hubo al menos una consulta sin filtrar por empresa.
   */
  static contadores(): { filasVerificadas: number; fugasDetectadas: number } {
    return {
      filasVerificadas: TenantSubscriber.filasVerificadas,
      fugasDetectadas: TenantSubscriber.fugasDetectadas,
    };
  }
}
