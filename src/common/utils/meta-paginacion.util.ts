import { IPaginationMeta } from 'nestjs-typeorm-paginate';

/**
 * Arma el `meta` de una página traída con SQL crudo.
 *
 * Existe para que las consultas transversales del superadmin —que no pueden
 * pasar por `paginateAndSearch` porque no salen de un repositorio con
 * filtrado por empresa— devuelvan **exactamente la misma forma** que el resto
 * de la API. El front tiene un solo lector de páginas; una segunda forma
 * obligaría a un caso especial en cada pantalla nueva.
 */
export function metaDePaginacion(
  total: number,
  itemCount: number,
  page: number,
  limit: number,
): IPaginationMeta {
  return {
    totalItems: total,
    itemCount,
    itemsPerPage: limit,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    currentPage: page,
  };
}

/** Normaliza `page` y `limit` de la query, con techo para no volcar la base. */
export function leerPaginacion(
  page?: string | number,
  limit?: string | number,
  limitPorDefecto = 20,
  limitMaximo = 200,
): { page: number; limit: number; offset: number } {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(Math.max(1, Number(limit) || limitPorDefecto), limitMaximo);

  return { page: p, limit: l, offset: (p - 1) * l };
}
