/**
 * Resuelve de forma segura el ordenamiento pedido por el cliente.
 *
 * El `orderBy` se interpola en la consulta SQL (tanto en `paginateAndSearch`
 * como en los query builders), así que NO puede venir crudo del request. Este
 * helper valida `sortBy` contra un whitelist (mapa `clave del front → columna/
 * alias real`) y normaliza la dirección. Si `sortBy` no está permitido, cae al
 * orden por defecto de la entidad.
 *
 * @param allowed  Mapa de claves aceptadas (las mismas que envía la tabla del
 *                 front, ej. 'truck.plate') a la columna/alias real para el ORDER BY.
 * @param fallback Orden por defecto cuando no se pide uno válido.
 */
export function resolveSort(
  sortBy: string | undefined,
  order: string | undefined,
  allowed: Record<string, string>,
  fallback: { orderBy: string; order: 'ASC' | 'DESC' },
): { orderBy: string; order: 'ASC' | 'DESC' } {
  const dir: 'ASC' | 'DESC' =
    String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  if (sortBy && Object.prototype.hasOwnProperty.call(allowed, sortBy)) {
    return { orderBy: allowed[sortBy], order: dir };
  }
  return fallback;
}
