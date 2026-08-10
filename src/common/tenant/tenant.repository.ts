import {
  DeleteResult,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  In,
  MoreThanOrEqual,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
  UpdateResult,
} from 'typeorm';
import {
  getCurrentCompanyId,
  getRetentionCutoff,
  isSystemContext,
} from './tenant-context';

/** Nombre poco frecuente para no pisar parámetros de las consultas del dominio. */
const PARAM = '__tenantCompanyId';
const PARAM_RETENCION = '__tenantRetentionCutoff';

/**
 * Entidades sujetas al límite de retención del plan.
 *
 * Son las que forman el histórico operativo. Quedan afuera a propósito los
 * maestros —flota, choferes, legajos, documentos, planes de mantenimiento—:
 * recortar la flota o el personal por antigüedad rompería el sistema, no
 * limitaría un histórico.
 */
const TABLAS_HISTORICAS = new Set([
  'trips',
  'trip_log_entries',
  'settlements',
  'fuel_records',
  'incidents',
  'maintenance_orders',
  'oea_inspections',
  'checklists',
]);

/** Métodos que ejecutan la consulta o materializan su SQL. */
const TERMINALES = new Set([
  'getMany',
  'getOne',
  'getOneOrFail',
  'getManyAndCount',
  'getCount',
  'getRawMany',
  'getRawOne',
  'getRawAndEntities',
  'getExists',
  'execute',
  'stream',
  'getSql',
  'getQuery',
  'getQueryAndParameters',
]);

/**
 * Envuelve un query builder para que el filtro por empresa se agregue **justo
 * antes de ejecutar**, y no al construirlo.
 *
 * El motivo es una trampa de TypeORM: `.where()` **reemplaza** todas las
 * condiciones previas, no las suma. Si el filtro se agregara al crear el query
 * builder, cualquiera de las 24 llamadas a `.where()` que hay en los servicios
 * lo borraría sin que nadie se entere, y la consulta pasaría a ver los datos de
 * todas las empresas.
 *
 * Aplicándolo al final, después de todo lo que haya hecho el llamador, el filtro
 * no se puede pisar. `.where()` sigue comportándose como siempre para quien lo
 * escribe.
 */
function protegerQueryBuilder<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  companyId: string,
  corteRetencion?: Date,
): SelectQueryBuilder<T> {
  let aplicado = false;

  const aplicarFiltro = (target: SelectQueryBuilder<T>) => {
    if (aplicado) return;
    aplicado = true;
    target.andWhere(`${target.alias}.companyId = :${PARAM}`, {
      [PARAM]: companyId,
    });
    if (corteRetencion) {
      target.andWhere(`${target.alias}.createdAt >= :${PARAM_RETENCION}`, {
        [PARAM_RETENCION]: corteRetencion,
      });
    }
  };

  return new Proxy(qb, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop) as unknown;
      if (typeof valor !== 'function') return valor;

      const fn = valor as (...args: unknown[]) => unknown;

      if (TERMINALES.has(prop as string)) {
        return (...args: unknown[]) => {
          aplicarFiltro(target);
          return fn.apply(target, args);
        };
      }

      // `clone()` devuelve un query builder nuevo que se escaparía del proxy:
      // se le aplica el filtro antes de copiarlo.
      if (prop === 'clone') {
        return (...args: unknown[]) => {
          aplicarFiltro(target);
          return fn.apply(target, args);
        };
      }

      return (...args: unknown[]) => {
        const resultado = fn.apply(target, args);
        // Los métodos encadenables devuelven el propio query builder; hay que
        // devolver el proxy para que la cadena siga protegida.
        return resultado === target ? receiver : resultado;
      };
    },
  }) as SelectQueryBuilder<T>;
}

/**
 * Repositorio que aplica el filtro por empresa **por defecto**.
 *
 * Un servicio que haga `findOne({ where: { id } })` sin acordarse de la empresa
 * igual queda aislado: el filtro se agrega acá. Ésa es la diferencia con
 * repetir `companyId` en cada método a mano, que funciona sólo mientras nadie se
 * olvide.
 *
 * Cuándo NO filtra:
 *
 *  - En contexto de sistema (`runAsSystem`): superadmin, reportes globales.
 *  - Sin contexto de empresa: login (se busca al usuario por email antes de
 *    saber su empresa), arranque y seeders.
 *
 * Cubre lecturas (`find*`, `count*`, `createQueryBuilder`) y escrituras masivas
 * (`update`, `delete`, `softDelete`, `restore`), que son las que no pasan por el
 * `TenantSubscriber` porque no materializan entidades.
 */
export class TenantRepository<T extends ObjectLiteral> extends Repository<T> {
  constructor(target: EntityTarget<T>, manager: EntityManager) {
    super(target, manager);
  }

  /** Empresa a aplicar, o `undefined` si esta operación no debe filtrarse. */
  private empresaActual(): string | undefined {
    if (isSystemContext()) return undefined;
    return getCurrentCompanyId();
  }

  /** true si esta entidad forma parte del histórico que el plan recorta. */
  private esHistorica(): boolean {
    return TABLAS_HISTORICAS.has(this.metadata.tableName);
  }

  /**
   * Corte de retención aplicable a ESTA entidad, o `undefined` si no aplica.
   *
   * El recorte es sólo de LECTURA: el dato sigue en la base (decisión D4). Por
   * eso no toca `update`, `delete` ni `softDelete` — un registro fuera de la
   * ventana no se ve, pero tampoco se rompe si algo lo referencia.
   */
  private corteActual(): Date | undefined {
    if (isSystemContext()) return undefined;
    if (!this.esHistorica()) return undefined;
    return getRetentionCutoff();
  }

  /**
   * Agrega `companyId` —y el corte de retención cuando corresponde— a un
   * `where`, soportando la forma de array (OR).
   */
  private scopeWhere(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
    companyId: string,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const corte = this.corteActual();
    const extra = {
      companyId,
      ...(corte ? { createdAt: MoreThanOrEqual(corte) } : {}),
    } as unknown as FindOptionsWhere<T>;

    if (Array.isArray(where)) {
      // Cada rama del OR se acota por empresa; si no, una sola rama sin filtrar
      // abriría el resultado a las demás empresas.
      return where.length
        ? where.map((w) => ({ ...w, ...extra }))
        : [extra];
    }
    return { ...(where ?? {}), ...extra };
  }

  private scopeOptions<O extends FindManyOptions<T> | FindOneOptions<T>>(
    options: O | undefined,
    companyId: string,
  ): O {
    return {
      ...(options ?? {}),
      where: this.scopeWhere(options?.where, companyId),
    } as O;
  }

  /**
   * Criterios de `update`/`delete`: pueden venir como id suelto, lista de ids o
   * condición. En todos los casos se acotan por empresa.
   */
  private scopeCriteria(criteria: unknown, companyId: string): FindOptionsWhere<T> {
    const extra = { companyId } as unknown as FindOptionsWhere<T>;

    if (Array.isArray(criteria)) {
      return { id: In(criteria), ...extra } as unknown as FindOptionsWhere<T>;
    }
    if (
      typeof criteria === 'string' ||
      typeof criteria === 'number' ||
      criteria instanceof Date
    ) {
      return { id: criteria, ...extra } as unknown as FindOptionsWhere<T>;
    }
    return { ...(criteria as FindOptionsWhere<T>), ...extra };
  }

  // ─── Lecturas ──────────────────────────────────────────────────────────────

  find(options?: FindManyOptions<T>): Promise<T[]> {
    const companyId = this.empresaActual();
    return super.find(companyId ? this.scopeOptions(options, companyId) : options);
  }

  findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]> {
    const companyId = this.empresaActual();
    return super.findAndCount(
      companyId ? this.scopeOptions(options, companyId) : options,
    );
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    const companyId = this.empresaActual();
    return super.findOne(companyId ? this.scopeOptions(options, companyId) : options);
  }

  findOneOrFail(options: FindOneOptions<T>): Promise<T> {
    const companyId = this.empresaActual();
    return super.findOneOrFail(
      companyId ? this.scopeOptions(options, companyId) : options,
    );
  }

  findBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
    const companyId = this.empresaActual();
    return super.findBy(companyId ? this.scopeWhere(where, companyId) : where);
  }

  findOneBy(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): Promise<T | null> {
    const companyId = this.empresaActual();
    return super.findOneBy(companyId ? this.scopeWhere(where, companyId) : where);
  }

  findOneByOrFail(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): Promise<T> {
    const companyId = this.empresaActual();
    return super.findOneByOrFail(
      companyId ? this.scopeWhere(where, companyId) : where,
    );
  }

  count(options?: FindManyOptions<T>): Promise<number> {
    const companyId = this.empresaActual();
    return super.count(companyId ? this.scopeOptions(options, companyId) : options);
  }

  countBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<number> {
    const companyId = this.empresaActual();
    return super.countBy(companyId ? this.scopeWhere(where, companyId) : where);
  }

  /**
   * Todo lo que se arma con query builder — incluido `paginateAndSearch`, que es
   * la base de casi todos los listados — queda filtrado sin tocar el código que
   * lo llama.
   */
  createQueryBuilder(
    alias?: string,
    queryRunner?: Parameters<Repository<T>['createQueryBuilder']>[1],
  ): SelectQueryBuilder<T> {
    const qb = super.createQueryBuilder(alias, queryRunner);
    const companyId = this.empresaActual();
    if (!companyId) return qb;
    return protegerQueryBuilder(qb, companyId, this.corteActual());
  }

  // ─── Escrituras masivas ────────────────────────────────────────────────────
  // No pasan por el TenantSubscriber: TypeORM ejecuta UPDATE/DELETE directo sin
  // materializar la entidad, así que el filtro tiene que ir en el criterio.

  update(
    criteria: Parameters<Repository<T>['update']>[0],
    partialEntity: Parameters<Repository<T>['update']>[1],
  ): Promise<UpdateResult> {
    const companyId = this.empresaActual();
    return super.update(
      companyId ? this.scopeCriteria(criteria, companyId) : criteria,
      partialEntity,
    );
  }

  delete(criteria: Parameters<Repository<T>['delete']>[0]): Promise<DeleteResult> {
    const companyId = this.empresaActual();
    return super.delete(
      companyId ? this.scopeCriteria(criteria, companyId) : criteria,
    );
  }

  softDelete(
    criteria: Parameters<Repository<T>['softDelete']>[0],
  ): Promise<UpdateResult> {
    const companyId = this.empresaActual();
    return super.softDelete(
      companyId ? this.scopeCriteria(criteria, companyId) : criteria,
    );
  }

  restore(
    criteria: Parameters<Repository<T>['restore']>[0],
  ): Promise<UpdateResult> {
    const companyId = this.empresaActual();
    return super.restore(
      companyId ? this.scopeCriteria(criteria, companyId) : criteria,
    );
  }
}
