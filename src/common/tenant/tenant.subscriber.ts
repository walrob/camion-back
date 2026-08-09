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
   * consulta que no filtra por empresa. Debe tener alerta configurada.
   */
  afterLoad(entity: Record<string, unknown>): void {
    if (isSystemContext()) return;

    const contexto = getCurrentCompanyId();
    // Sin contexto no hay con qué comparar: pasa en el login, donde se busca al
    // usuario por email antes de saber a qué empresa pertenece.
    if (!contexto || !entity?.companyId) return;

    if (entity.companyId !== contexto) {
      this.logger.error(
        `FUGA ENTRE EMPRESAS: se leyó una fila de ${String(entity.companyId)} ` +
          `estando en contexto de ${contexto}. Hay una consulta sin filtrar.`,
      );
      throw new ForbiddenException('Acceso a datos de otra empresa.');
    }
  }
}
