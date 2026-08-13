import { DataSource, DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from 'src/database/data-source';
import { TenantEntity } from './tenant.entity';

/**
 * Red de seguridad del modelo multi-empresa (riesgo R1.3 del plan SaaS).
 *
 * Recorre los metadatos de TypeORM y falla si aparece una entidad de negocio sin
 * `companyId`. Es lo que evita que la fase 2 (aislamiento por defecto) se
 * construya sobre un modelo incompleto: una entidad sin `companyId` queda fuera
 * del scoping y es el único error capaz de provocar una fuga entre empresas.
 *
 * Si este test falla al agregar una entidad nueva, hay exactamente dos salidas
 * válidas: que herede de `TenantEntity`, o que se agregue a `CATALOGO_GLOBAL`
 * con un motivo escrito. No hay una tercera.
 *
 * No necesita conexión a la base: sólo lee metadatos.
 */

/**
 * Entidades deliberadamente GLOBALES: catálogo compartido por todas las
 * empresas. Agregar algo acá es una decisión de diseño, no un atajo.
 */
const CATALOGO_GLOBAL: Record<string, string> = {
  Company: 'Es el tenant en sí: es la raíz a la que apuntan las demás.',
  Plan: 'Catálogo comercial de planes, común a todas las empresas.',
  Addon: 'Catálogo comercial de add-ons. Lo contratado por cada empresa vive en CompanyAddon, que sí es de tenant.',
  AuditLog:
    'Registro de auditoría. TIENE una columna `companyId` —para decir a qué ' +
    'empresa afectó una acción— pero es nullable y no hereda de TenantEntity: ' +
    'debe poder registrar acciones globales del superadmin, que no pertenecen ' +
    'a ninguna empresa. El filtrado por empresa lo hace AuditLogService de ' +
    'forma explícita según quién consulta.',
};

describe('Modelo multi-empresa', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    // buildMetadatas() arma los metadatos sin abrir conexión, pero es ASÍNCRONO:
    // `entities` son globs y las clases se cargan con import() dinámico. Sin el
    // await, entityMetadatas queda vacío y los tests pasan sin verificar nada.
    // Nunca abre conexión, pero TypeORM exige que `database` esté definido al
    // construir el DataSource. Bajo jest NODE_ENV es 'test' y el `.env.test` que
    // busca data-source.ts puede no existir, así que se completa con un
    // placeholder: así el test corre en cualquier máquina y en CI sin base.
    dataSource = new DataSource({
      ...dataSourceOptions,
      database: (dataSourceOptions as { database?: string }).database || 'metadata_only',
    } as DataSourceOptions);
    await (dataSource as any).buildMetadatas();

    // Si el glob no resolvió, todo lo que sigue es un falso verde.
    expect(dataSource.entityMetadatas.length).toBeGreaterThan(20);
  });

  it('todas las entidades de negocio tienen companyId', () => {
    const sinCompanyId = dataSource.entityMetadatas
      .filter((m) => !CATALOGO_GLOBAL[m.name])
      .filter((m) => !m.columns.some((c) => c.propertyName === 'companyId'))
      .map((m) => `${m.name} (${m.tableName})`);

    expect(sinCompanyId).toEqual([]);
  });

  it('las entidades de negocio heredan de TenantEntity', () => {
    // Tener la columna no alcanza: el aislamiento de la fase 2 se apoya en la
    // herencia para saber a qué entidades aplicarse.
    const noHeredan = dataSource.entityMetadatas
      .filter((m) => !CATALOGO_GLOBAL[m.name])
      .filter((m) => !(m.target instanceof Function) || !(m.target.prototype instanceof TenantEntity))
      .map((m) => m.name);

    expect(noHeredan).toEqual([]);
  });

  it('companyId es obligatorio y está indexado', () => {
    const problemas: string[] = [];

    for (const metadata of dataSource.entityMetadatas) {
      if (CATALOGO_GLOBAL[metadata.name]) continue;

      const columna = metadata.columns.find(
        (c) => c.propertyName === 'companyId',
      );
      if (!columna) continue; // ya lo reporta el primer test

      if (columna.isNullable) {
        problemas.push(`${metadata.name}.companyId es nullable`);
      }

      const indexado =
        metadata.indices.some((i) =>
          i.columns.some((c) => c.propertyName === 'companyId'),
        ) ||
        metadata.uniques.some((u) =>
          u.columns.some((c) => c.propertyName === 'companyId'),
        );

      if (!indexado) {
        problemas.push(`${metadata.name}.companyId no tiene índice`);
      }
    }

    expect(problemas).toEqual([]);
  });

  it('ningún índice único global compite con el aislamiento por empresa', () => {
    // Únicos globales admitidos, con su justificación (ver Anexo A del plan).
    const GLOBALES_ADMITIDOS = [
      'Company.slug',
      'Plan.code',
      // Único global por decisión D1: un usuario pertenece a una empresa por vez.
      'User.email',
      // FK a employees, cuyo id ya es único en todo el sistema.
      'Driver.employeeId',
      // Único implícito del @OneToOne con User (TypeORM indexa el lado dueño).
      // Correcto por D1: si un usuario pertenece a una sola empresa, no puede
      // ser empleado de dos. Scoparlo por companyId no aportaría nada.
      'Employee.userId',
      // El token de invitación ES la credencial: se resuelve ANTES de saber a
      // qué empresa pertenece quien lo usa, así que no puede scoparse. Es un
      // UUID aleatorio de un solo uso y con vencimiento.
      'Invite.token',
      // El token identifica un dispositivo, que no puede estar en dos empresas.
      'DeviceToken.token',
    ];

    const globalesInesperados: string[] = [];

    for (const metadata of dataSource.entityMetadatas) {
      if (CATALOGO_GLOBAL[metadata.name]) continue;

      // `@Column({ unique: true })` no deja marca en la columna: TypeORM lo
      // materializa como UniqueMetadata y, en MySQL, además como índice único.
      // Hay que mirar las dos colecciones para no perder ninguno.
      const conjuntosUnicos = [
        ...metadata.uniques.map((u) => u.columns),
        ...metadata.indices.filter((i) => i.isUnique).map((i) => i.columns),
      ];

      for (const columnas of conjuntosUnicos) {
        // Si el único incluye companyId, ya está scopeado por empresa.
        if (columnas.some((c) => c.propertyName === 'companyId')) continue;

        const nombres = columnas.map((c) => c.propertyName);

        // Un único global de una sola columna puede estar admitido por decisión
        // explícita (ver Anexo A del plan); uno compuesto, nunca.
        const clave = `${metadata.name}.${nombres[0]}`;
        if (nombres.length === 1 && GLOBALES_ADMITIDOS.includes(clave)) continue;

        globalesInesperados.push(
          nombres.length === 1
            ? clave
            : `${metadata.name} UNIQUE(${nombres.join(', ')})`,
        );
      }
    }

    // Duplicados: un mismo único puede aparecer como constraint y como índice.
    expect([...new Set(globalesInesperados)].sort()).toEqual([]);
  });
});
