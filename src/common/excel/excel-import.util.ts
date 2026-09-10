import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { buildWorkbook, ExcelRow } from './excel.util';

/** Tope de filas por archivo: una carga inicial, no una migración masiva. */
export const IMPORT_ROW_LIMIT = 5_000;

export interface ImportColumn<TCtx = any> {
  /** Encabezado tal cual sale en la plantilla. */
  header: string;
  /** Campo destino en el objeto que reciben `create`/`update`. */
  field: string;
  required?: boolean;
  /** Otros encabezados aceptados (planillas viejas, sinónimos). */
  aliases?: string[];
  /** Qué se espera en la celda; va a la hoja "Instrucciones". */
  hint?: string;
  /** Valor de muestra para la fila de ejemplo de la plantilla. */
  example?: string;
  /**
   * Convierte el texto de la celda al valor final. Lanzar `Error` acá corta
   * sólo esa celda y el motivo llega al usuario junto al número de fila.
   */
  parse?: (raw: string, ctx: TCtx) => unknown;
}

export interface ImportRowError {
  fila: number;
  columna?: string;
  motivo: string;
}

export interface ImportResult {
  procesadas: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: ImportRowError[];
  /** `true` = no se escribió nada; es la previsualización. */
  simulacion: boolean;
  /**
   * `true` = la validación pasó pero un guardado falló y la carga se detuvo
   * ahí, con las filas anteriores ya escritas.
   *
   * Se informa aparte porque cambia qué tiene que hacer el usuario: con un
   * error de validación no se escribió nada y alcanza con corregir y volver a
   * subir; acá quedó una carga parcial y hay que saberlo. Es raro —la
   * previsualización ya resolvió referencias y duplicados— pero puede pasar si
   * alguien tocó los mismos datos en el medio.
   */
  interrumpido: boolean;
}

export interface ImportOptions<TRow = any, TCtx = any> {
  buffer: Buffer;
  columns: ImportColumn<TCtx>[];
  ctx?: TCtx;
  /** Valida y reporta sin escribir nada. */
  dryRun?: boolean;
  /**
   * Clave natural de la fila (patente, DNI, nombre). Sirve para detectar
   * repetidos dentro del archivo y para decidir alta vs. actualización.
   */
  key?: (row: TRow, ctx: TCtx) => string | undefined | null;
  /** Validaciones que cruzan varias columnas. Devolver el motivo si falla. */
  validate?: (row: TRow, ctx: TCtx) => string | void | undefined;
  /** Busca el registro existente por clave natural. */
  find?: (key: string, ctx: TCtx) => Promise<any>;
  create: (row: TRow, ctx: TCtx) => Promise<unknown>;
  /** Sin `update`, una fila que ya existe se omite en lugar de pisarse. */
  update?: (existing: any, row: TRow, ctx: TCtx) => Promise<unknown>;
}

/** Encabezados comparables: sin tildes, sin espacios de más, en minúscula. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Lee la primera hoja del archivo como matriz de strings. Se usa `raw: false`
 * para que las fechas y los números lleguen ya formateados por SheetJS: parsear
 * el serial de Excel a mano es de donde salen los errores de zona horaria.
 */
function readRows(buffer: Buffer): string[][] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  } catch {
    throw new BadRequestException(
      'No se pudo leer el archivo. Tiene que ser un Excel (.xlsx) o un CSV.',
    );
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new BadRequestException('El archivo no tiene hojas.');
  return XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  });
}

/** Mapea cada columna declarada al índice donde cayó en el archivo. */
function mapColumns(headerRow: string[], columns: ImportColumn[]) {
  const present = headerRow.map(normalizeHeader);
  const indexes = new Map<string, number>();
  const faltantes: string[] = [];

  for (const col of columns) {
    const candidates = [col.header, ...(col.aliases ?? [])].map(normalizeHeader);
    const idx = present.findIndex((h) => h && candidates.includes(h));
    if (idx >= 0) indexes.set(col.field, idx);
    else if (col.required) faltantes.push(col.header);
  }

  if (faltantes.length) {
    throw new BadRequestException(
      `Faltan columnas obligatorias en el archivo: ${faltantes.join(', ')}. ` +
        'Descargá la plantilla y usá esos encabezados.',
    );
  }
  return indexes;
}

/**
 * Carga un Excel/CSV con validación previa.
 *
 * La validación es **todo o nada**: se recorre el archivo entero antes de
 * escribir y, si alguna fila no pasa, no se guarda ninguna. Una carga a medias
 * deja al usuario sin saber qué entró y qué no, y como el alta se decide por
 * clave natural, corregir el archivo y volver a subirlo no duplica.
 *
 * Lo que no puede garantizar es la escritura: no hay transacción porque el alta
 * de cada fila pasa por el servicio de dominio —que valida catálogos, mueve
 * estados y abre historial— con su propio repositorio. Si un guardado falla, la
 * carga se detiene en esa fila y el resultado vuelve con `interrumpido` y los
 * contadores reales de lo que sí se escribió.
 */
export async function runExcelImport<TRow = any, TCtx = any>(
  options: ImportOptions<TRow, TCtx>,
): Promise<ImportResult> {
  const { buffer, columns, dryRun = false } = options;
  const ctx = (options.ctx ?? {}) as TCtx;

  const matrix = readRows(buffer);
  const headerRow = matrix[0];
  if (!headerRow?.length) {
    throw new BadRequestException('El archivo está vacío.');
  }
  const indexes = mapColumns(headerRow, columns);

  // Filas de datos, salteando las totalmente vacías que Excel suele dejar al pie.
  const dataRows = matrix
    .slice(1)
    .map((cells, i) => ({ cells, fila: i + 2 })) // +2: fila 1 = encabezados
    .filter(({ cells }) => cells.some((c) => String(c ?? '').trim() !== ''));

  if (dataRows.length > IMPORT_ROW_LIMIT) {
    throw new BadRequestException(
      `El archivo tiene ${dataRows.length} filas y el máximo es ` +
        `${IMPORT_ROW_LIMIT}. Dividilo en partes más chicas.`,
    );
  }

  const errores: ImportRowError[] = [];
  const parsed: { row: TRow; fila: number; key?: string | null }[] = [];
  const vistas = new Map<string, number>();

  for (const { cells, fila } of dataRows) {
    const row: Record<string, unknown> = {};
    let filaOk = true;

    for (const col of columns) {
      const idx = indexes.get(col.field);
      const raw = idx === undefined ? '' : String(cells[idx] ?? '').trim();

      if (!raw) {
        if (col.required) {
          errores.push({
            fila,
            columna: col.header,
            motivo: 'Dato obligatorio.',
          });
          filaOk = false;
        }
        continue;
      }

      try {
        row[col.field] = col.parse ? col.parse(raw, ctx) : raw;
      } catch (e) {
        errores.push({
          fila,
          columna: col.header,
          motivo: e instanceof Error ? e.message : 'Valor inválido.',
        });
        filaOk = false;
      }
    }

    if (!filaOk) continue;

    const motivo = options.validate?.(row as TRow, ctx);
    if (motivo) {
      errores.push({ fila, motivo });
      continue;
    }

    const key = options.key?.(row as TRow, ctx) ?? null;
    if (key) {
      const previa = vistas.get(key);
      if (previa) {
        errores.push({
          fila,
          motivo: `"${key}" ya aparece en la fila ${previa} del archivo.`,
        });
        continue;
      }
      vistas.set(key, fila);
    }

    parsed.push({ row: row as TRow, fila, key });
  }

  const base: ImportResult = {
    procesadas: dataRows.length,
    creados: 0,
    actualizados: 0,
    omitidos: 0,
    errores,
    simulacion: dryRun,
    interrumpido: false,
  };

  // Con errores no se escribe nada, ni siquiera las filas sanas.
  if (errores.length) return base;

  for (const { row, fila, key } of parsed) {
    try {
      const existing = key && options.find ? await options.find(key, ctx) : null;

      if (existing) {
        if (!options.update) {
          base.omitidos += 1;
          continue;
        }
        if (!dryRun) await options.update(existing, row, ctx);
        base.actualizados += 1;
      } else {
        if (!dryRun) await options.create(row, ctx);
        base.creados += 1;
      }
    } catch (e) {
      base.errores.push({
        fila,
        motivo: e instanceof Error ? e.message : 'No se pudo guardar la fila.',
      });
      // Un fallo al guardar corta acá: seguir con las que vienen después
      // dejaría agujeros salteados en el medio del archivo, más difíciles de
      // reconstruir que un corte limpio en una fila conocida.
      //
      // Los contadores NO se ponen en cero: las filas anteriores ya se
      // escribieron y decir "0 creados" sería mentirle al usuario. Se marca
      // `interrumpido` para que la pantalla lo diga con esas palabras.
      base.interrumpido = true;
      break;
    }
  }

  return base;
}

/**
 * Plantilla de carga: hoja 1 con los encabezados y una fila de ejemplo, hoja 2
 * con qué se espera en cada columna. La fila de ejemplo se borra antes de
 * subir; si quedó, entra como una fila más, así que la plantilla la marca.
 */
export function buildImportTemplate(
  sheetName: string,
  columns: ImportColumn[],
): Buffer {
  const headers = columns.map((c) => c.header);
  const ejemplo: ExcelRow = Object.fromEntries(
    columns.map((c) => [c.header, c.example ?? '']),
  );
  const instrucciones: ExcelRow[] = columns.map((c) => ({
    Columna: c.header,
    Obligatoria: c.required ? 'Sí' : 'No',
    'Qué poner': c.hint ?? '',
    Ejemplo: c.example ?? '',
  }));

  return buildWorkbook([
    { name: sheetName, columns: headers, rows: [ejemplo] },
    {
      name: 'Instrucciones',
      columns: ['Columna', 'Obligatoria', 'Qué poner', 'Ejemplo'],
      rows: instrucciones,
    },
  ]);
}
