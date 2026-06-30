import { Repository, ObjectLiteral } from 'typeorm';
import { Pagination } from 'nestjs-typeorm-paginate';
import { PaginateAndSearchDto } from './paginate-and-search.dto';

export async function paginateAndSearch<T extends ObjectLiteral>(
  repository: Repository<T>,
  dto: PaginateAndSearchDto,
): Promise<Pagination<T>> {
  const {
    page,
    limit,
    search,
    searchFields,
    orderBy,
    order,
    baseWhere,
    from,
    to,
    dateField = 'createdAt',
    relations = [],
    select,
  } = dto;

  const qb = repository.createQueryBuilder('entity');

  // 📋 Seleccionar columnas específicas si se proporciona
  if (select && select.length) {
    const selectColumns = select.map((col) =>
      col.includes('.') ? col : `entity.${col}`,
    );
    qb.select(selectColumns);
  }

  // 🔗 Relaciones (soporta anidadas: 'driver.user' cuelga del alias 'driver')
  relations.forEach((relation) => {
    const alias = relation.replace(/\./g, '_');
    const lastDot = relation.lastIndexOf('.');
    const leftSide =
      lastDot === -1
        ? `entity.${relation}`
        : `${relation.slice(0, lastDot).replace(/\./g, '_')}.${relation.slice(lastDot + 1)}`;
    qb.leftJoinAndSelect(leftSide, alias);
  });

  // 🎯 Filtros
  if (baseWhere) {
    Object.entries(baseWhere).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      // 👉 si es array → IN
      if (Array.isArray(value)) {
        qb.andWhere(`entity.${key} IN (:...${key})`, { [key]: value });
      } else {
        qb.andWhere(`entity.${key} = :${key}`, { [key]: value });
      }
    });
  }

  // 📅 Filtro por fechas (DATE o TIMESTAMP)
  if (from && to) {
    qb.andWhere(`entity.${dateField} BETWEEN :from AND :to`, {
      from,
      to,
    });
  } else if (from) {
    qb.andWhere(`entity.${dateField} >= :from`, { from });
  } else if (to) {
    qb.andWhere(`entity.${dateField} <= :to`, { to });
  }

  // 🔍 Búsqueda textual
  if (search && searchFields.length) {
    const searchConditions = searchFields.map((field) =>
      field.includes('.')
        ? `LOWER(${field}) LIKE LOWER(:search)`
        : `LOWER(entity.${field}) LIKE LOWER(:search)`,
    );

    qb.andWhere(`(${searchConditions.join(' OR ')})`, {
      search: `%${search}%`,
    });
  }

  // ↕ Orden
  qb.orderBy(orderBy.includes('.') ? orderBy : `entity.${orderBy}`, order);

  // 📄 Paginación — take/skip pagina por entidad (no por fila SQL),
  // evitando el problema de LIMIT incorrecto con leftJoinAndSelect one-to-many
  const total = await qb.getCount();
  const items = await qb.take(limit).skip((page - 1) * limit).getMany();

  return {
    items,
    meta: {
      totalItems: total,
      itemCount: items.length,
      itemsPerPage: limit,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    },
  } as Pagination<T>;
}
