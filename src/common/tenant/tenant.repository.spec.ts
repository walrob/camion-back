import { DataSource, DataSourceOptions, Repository } from 'typeorm';
import { dataSourceOptions } from 'src/database/data-source';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TenantRepository } from './tenant.repository';
import {
  runAsCompany,
  runAsSystem,
  runWithTenantContext,
  setTenantContext,
} from './tenant-context';

/**
 * Verifica que el filtrado por empresa se aplique SOLO, sin que el llamador
 * tenga que pedirlo, y que no se pueda pisar sin querer.
 *
 * No abre conexión: compara el SQL generado, que es donde vive el filtro.
 */

const EMPRESA_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const EMPRESA_B = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('TenantRepository: aislamiento por empresa', () => {
  let dataSource: DataSource;
  let trucks: Repository<Truck>;
  let trips: Repository<Trip>;

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      database:
        (dataSourceOptions as { database?: string }).database || 'metadata_only',
    } as DataSourceOptions);
    await (dataSource as any).buildMetadatas();

    const manager = dataSource.createEntityManager();
    trucks = new TenantRepository(Truck, manager);
    trips = new TenantRepository(Trip, manager);
  });

  /** Corre `fn` como si fuera un request autenticado de `companyId`. */
  const comoEmpresa = <T>(companyId: string, fn: () => T): T =>
    runWithTenantContext(() => {
      setTenantContext(companyId, 'user-1');
      return fn();
    });

  /**
   * Sólo la cláusula WHERE. Mirar el SQL entero no sirve: `companyId` es una
   * columna más y siempre aparece en el SELECT, así que la aserción daría
   * verdadera incluso con el filtrado roto.
   */
  const whereDe = (sql: string): string => {
    const i = sql.indexOf('WHERE');
    return i === -1 ? '' : sql.slice(i);
  };

  it('filtra por empresa aunque el servicio no lo pida', () => {
    const where = whereDe(
      comoEmpresa(EMPRESA_A, () => trucks.createQueryBuilder('truck').getSql()),
    );
    expect(where).toContain('companyId');
  });

  it('NO se pierde el filtro cuando el servicio usa .where()', () => {
    // `.where()` reemplaza las condiciones previas: si el filtro se agregara al
    // construir el query builder, esta llamada lo borraría. Es el escenario que
    // aparece 24 veces en los servicios actuales.
    const where = whereDe(
      comoEmpresa(EMPRESA_A, () =>
        trips.createQueryBuilder('t').where('t.distanceKm IS NOT NULL').getSql(),
      ),
    );

    expect(where).toContain('distanceKm');
    expect(where).toContain('companyId');
  });

  it('sobrevive a varias llamadas encadenadas a .where()', () => {
    const where = whereDe(
      comoEmpresa(EMPRESA_A, () =>
        trips
          .createQueryBuilder('t')
          .where('t.a = 1')
          .andWhere('t.b = 2')
          .where('t.c = 3') // vuelve a pisar todo
          .getSql(),
      ),
    );

    expect(where).toContain('companyId');
    expect(where).toContain('t.c = 3');
  });

  it('el parámetro lleva la empresa del contexto', () => {
    const [, params] = comoEmpresa(EMPRESA_B, () =>
      trucks.createQueryBuilder('truck').getQueryAndParameters(),
    );
    expect(params).toContain(EMPRESA_B);
  });

  it('runAsSystem no filtra: es la vía de escape del superadmin', () => {
    const where = whereDe(
      runAsSystem(() => trucks.createQueryBuilder('truck').getSql()),
    );
    expect(where).not.toContain('companyId');
  });

  it('runAsCompany filtra por la empresa indicada (crons y webhooks)', () => {
    const [, params] = runAsCompany(EMPRESA_B, () =>
      trucks.createQueryBuilder('truck').getQueryAndParameters(),
    );
    expect(params).toContain(EMPRESA_B);
  });

  it('sin contexto no filtra: es el caso del login, que busca por email', () => {
    const where = whereDe(trucks.createQueryBuilder('truck').getSql());
    expect(where).not.toContain('companyId');
  });

  it('el filtro se aplica una sola vez aunque se ejecute dos veces', () => {
    // paginateAndSearch hace getCount() y después getMany() sobre el MISMO
    // query builder: el filtro no debe duplicarse.
    const where = whereDe(
      comoEmpresa(EMPRESA_A, () => {
        const qb = trucks.createQueryBuilder('truck');
        qb.getSql();
        return qb.getSql();
      }),
    );

    const ocurrencias = (where.match(/companyId/g) ?? []).length;
    expect(ocurrencias).toBe(1);
  });
});
