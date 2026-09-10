/**
 * Conversores de celda para las cargas por Excel.
 *
 * Todos lanzan `Error` con un motivo en español: el motor de import lo captura
 * y se lo muestra al usuario junto al número de fila y el nombre de la columna,
 * así que el mensaje tiene que servirle a quien armó la planilla.
 */

/** Texto sin espacios de más, acotado para no reventar la columna en base. */
export function text(max = 255) {
  return (raw: string): string => {
    const value = raw.trim();
    if (value.length > max) {
      throw new Error(`No puede superar los ${max} caracteres.`);
    }
    return value;
  };
}

/**
 * Número en formato es-AR o en formato inglés.
 *
 * Excel exporta según la configuración regional de quien armó la planilla, así
 * que llegan las dos formas y hay que desambiguar: cuando aparecen punto y
 * coma, el separador decimal es el que está más a la derecha; con un solo
 * punto, se toma como miles sólo si agrupa de a tres exactos ("1.234"), que es
 * lo que escribe Excel en es-AR.
 */
export function number(opts: { min?: number; max?: number; int?: boolean } = {}) {
  return (raw: string): number => {
    let value = raw.trim().replace(/\s/g, '');
    const lastDot = value.lastIndexOf('.');
    const lastComma = value.lastIndexOf(',');

    if (lastDot >= 0 && lastComma >= 0) {
      const decimalSep = lastDot > lastComma ? '.' : ',';
      const thousandSep = decimalSep === '.' ? ',' : '.';
      value = value.split(thousandSep).join('').replace(decimalSep, '.');
    } else if (lastComma >= 0) {
      value = value.replace(',', '.');
    } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(value)) {
      value = value.split('.').join('');
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error('Tiene que ser un número.');
    if (opts.int && !Number.isInteger(parsed)) {
      throw new Error('Tiene que ser un número entero.');
    }
    if (opts.min !== undefined && parsed < opts.min) {
      throw new Error(`No puede ser menor a ${opts.min}.`);
    }
    if (opts.max !== undefined && parsed > opts.max) {
      throw new Error(`No puede ser mayor a ${opts.max}.`);
    }
    return parsed;
  };
}

/** Serial de Excel: días desde el 30/12/1899, con el bug del año bisiesto 1900. */
function fromExcelSerial(serial: number): Date | null {
  if (serial < 1 || serial > 60_000) return null;
  return new Date(Math.round((serial - 25569) * 86_400_000));
}

/**
 * Fecha en `dd/mm/aaaa`, `aaaa-mm-dd` o serial de Excel, normalizada a
 * `aaaa-mm-dd`.
 *
 * Se devuelve string y no `Date` a propósito: las columnas de fecha del sistema
 * son `date` sin hora, y construir un `Date` local acá corre el día para atrás
 * en cualquier huso al oeste de UTC.
 */
export function date() {
  return (raw: string): string => {
    const value = raw.trim();

    if (/^\d+([.,]\d+)?$/.test(value)) {
      const asDate = fromExcelSerial(Number(value.replace(',', '.')));
      if (asDate) return asDate.toISOString().slice(0, 10);
    }

    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const local = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);

    let y: number, m: number, d: number;
    if (iso) {
      [, y, m, d] = iso.map(Number) as unknown as number[];
    } else if (local) {
      [, d, m, y] = local.map(Number) as unknown as number[];
      if (y < 100) y += y < 70 ? 2000 : 1900;
    } else {
      throw new Error('Fecha inválida. Usá dd/mm/aaaa.');
    }

    if (m < 1 || m > 12 || d < 1 || d > 31) {
      throw new Error('Fecha inválida. Usá dd/mm/aaaa.');
    }
    // `Date.UTC` normaliza y a la vez detecta el 31/02: si el día se corrió, no existía.
    const utc = new Date(Date.UTC(y, m - 1, d));
    if (utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) {
      throw new Error('Esa fecha no existe.');
    }
    return utc.toISOString().slice(0, 10);
  };
}

/** Sí/No, true/false, 1/0, X. Lo que la gente realmente escribe. */
export function bool() {
  return (raw: string): boolean => {
    const value = raw.trim().toLowerCase();
    if (['si', 'sí', 'true', '1', 'x', 'verdadero'].includes(value)) return true;
    if (['no', 'false', '0', '', 'falso'].includes(value)) return false;
    throw new Error('Poné Sí o No.');
  };
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Convierte la etiqueta en español a la clave interna del enum.
 *
 * `labels` es el mismo mapa clave→etiqueta que usa la exportación, así que lo
 * que baja en un Excel vuelve a subir sin traducción manual. También se acepta
 * la clave cruda, para quien exporta de otro sistema.
 */
export function enumLabel<T extends string>(labels: Record<string, string>) {
  const porEtiqueta = new Map<string, string>();
  for (const [key, label] of Object.entries(labels)) {
    porEtiqueta.set(normalize(label), key);
    porEtiqueta.set(normalize(key), key);
  }
  const opciones = Object.values(labels).join(', ');

  return (raw: string): T => {
    const found = porEtiqueta.get(normalize(raw));
    if (!found) throw new Error(`Valor inválido. Opciones: ${opciones}.`);
    return found as T;
  };
}

/**
 * Resuelve una referencia a otra entidad (camión por patente, chofer por DNI)
 * contra un mapa cargado antes de recorrer las filas.
 *
 * El mapa se arma una sola vez y se pasa por el contexto justamente para no
 * pegarle a la base una vez por fila.
 */
export function lookup<TCtx>(
  pick: (ctx: TCtx) => Map<string, string>,
  queEs: string,
) {
  return (raw: string, ctx: TCtx): string => {
    const id = pick(ctx).get(normalize(raw));
    if (!id) throw new Error(`No existe ${queEs} "${raw.trim()}".`);
    return id;
  };
}

/** Índice normalizado para `lookup`: clave visible → id. */
export function indexBy<T>(
  items: T[],
  key: (item: T) => string | null | undefined,
  id: (item: T) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const k = key(item);
    if (k) map.set(normalize(k), id(item));
  }
  return map;
}

/** Email con una validación mínima: el alta real la vuelve a validar. */
export function email() {
  return (raw: string): string => {
    const value = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      throw new Error('Email inválido.');
    }
    return value;
  };
}

/** Patente en mayúsculas y sin separadores: AB123CD o ABC123. */
export function plate() {
  return (raw: string): string => {
    const value = raw.trim().toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{5,10}$/.test(value)) {
      throw new Error('Patente inválida (ej. AB123CD).');
    }
    return value;
  };
}
