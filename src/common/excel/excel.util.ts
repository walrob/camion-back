import { BadRequestException, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import * as XLSX from 'xlsx';

export const EXCEL_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Tope de filas por descarga.
 *
 * El Excel se arma entero en memoria antes de responder, así que un histórico
 * de años sin acotar tira abajo el proceso. En vez de truncar en silencio —el
 * usuario se llevaría un archivo incompleto sin enterarse— se corta con un
 * error que le pide acotar el período. Los filtros de la tabla ya viajan al
 * endpoint, así que acotar es cuestión de elegir un rango de fechas.
 */
export const EXPORT_ROW_LIMIT = 50_000;

export function assertExportSize(total: number, limite = EXPORT_ROW_LIMIT) {
  if (total > limite) {
    throw new BadRequestException(
      `La descarga supera las ${limite.toLocaleString('es-AR')} filas ` +
        `(${total.toLocaleString('es-AR')}). Acotá el período o agregá filtros ` +
        'y volvé a intentar.',
    );
  }
}

/** Una fila ya lista para la planilla: claves = encabezados en español. */
export type ExcelRow = Record<string, string | number | null | undefined>;

export interface ExcelSheet {
  name: string;
  rows: ExcelRow[];
  /**
   * Orden de las columnas. Necesario porque `json_to_sheet` deduce las claves
   * de la primera fila: si esa fila trae un opcional vacío, la columna
   * desaparece de todo el archivo.
   */
  columns: string[];
}

/**
 * Ancho de columna aproximado por el contenido más largo, acotado para que un
 * campo de texto libre no empuje al resto fuera de la pantalla.
 */
function columnWidths(rows: ExcelRow[], columns: string[]) {
  return columns.map((col) => {
    const largest = rows.reduce(
      (max, row) => Math.max(max, String(row[col] ?? '').length),
      col.length,
    );
    return { wch: Math.min(Math.max(largest + 2, 10), 42) };
  });
}

function appendSheet(wb: XLSX.WorkBook, sheet: ExcelSheet) {
  const normalized = sheet.rows.map((row) =>
    Object.fromEntries(sheet.columns.map((col) => [col, row[col] ?? ''])),
  );
  const ws = XLSX.utils.json_to_sheet(normalized, { header: sheet.columns });
  ws['!cols'] = columnWidths(sheet.rows, sheet.columns);
  // Deja fija la fila de encabezados al desplazarse.
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
}

/** Arma un workbook de una o varias hojas y lo devuelve como buffer. */
export function buildWorkbook(sheets: ExcelSheet[]): Buffer {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => appendSheet(wb, sheet));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Atajo para el caso habitual: una sola hoja. */
export function buildXlsx(
  name: string,
  columns: string[],
  rows: ExcelRow[],
): Buffer {
  return buildWorkbook([{ name, columns, rows }]);
}

/**
 * Setea los headers de descarga y envuelve el buffer. El nombre se sanea
 * porque viaja dentro de un `Content-Disposition` entre comillas.
 */
export function sendXlsx(
  res: Response,
  filename: string,
  buffer: Buffer,
): StreamableFile {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  res.set({
    'Content-Type': EXCEL_MIME,
    'Content-Disposition': `attachment; filename="${safe}"`,
  });
  return new StreamableFile(buffer);
}

/** Fecha sin hora, como la espera Excel en es-AR. */
export function dateCell(value?: Date | string | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Fecha con hora, para bitácoras y auditoría. */
export function dateTimeCell(value?: Date | string | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Booleano legible: la planilla la lee gente, no un parser. */
export function boolCell(value?: boolean | null): string {
  return value ? 'Sí' : 'No';
}
