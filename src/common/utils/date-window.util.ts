import { BadRequestException } from '@nestjs/common';

const DAY_MS = 86_400_000;

export interface DateWindowOptions {
  /** Días hacia atrás desde hoy cuando no se envía ninguna fecha. */
  defaultDays?: number;
  /** Ventana máxima permitida entre `from` y `to`, en meses. */
  maxMonths?: number;
}

export interface DateWindow {
  from: string;
  to: string;
}

/**
 * Resuelve y valida la ventana de fechas de un reporte de agregación.
 *
 * - Sin fechas → últimos `defaultDays` días (hasta hoy inclusive).
 * - Con una sola fecha → la otra se completa respecto de esa.
 * - Rechaza rangos con `from` posterior a `to` o que superen `maxMonths`.
 *
 * Devuelve límites de día completos (`00:00:00` / `23:59:59`) en hora local
 * del servidor, en formato `YYYY-MM-DD HH:mm:ss` apto para columnas datetime.
 */
export function resolveDateWindow(
  from?: string,
  to?: string,
  { defaultDays = 30, maxMonths = 6 }: DateWindowOptions = {},
): DateWindow {
  const toDay = to ? parseDay(to, 'to') : startOfToday();
  const fromDay = from
    ? parseDay(from, 'from')
    : new Date(toDay.getTime() - defaultDays * DAY_MS);

  if (fromDay > toDay) {
    throw new BadRequestException(
      'Rango de fechas inválido: "from" es posterior a "to".',
    );
  }

  const maxTo = new Date(fromDay);
  maxTo.setMonth(maxTo.getMonth() + maxMonths);
  if (toDay > maxTo) {
    throw new BadRequestException(
      `El rango de fechas no puede superar ${maxMonths} meses.`,
    );
  }

  return { from: format(fromDay, false), to: format(toDay, true) };
}

// Interpreta 'YYYY-MM-DD' como medianoche local (evita el corrimiento de día
// que produce new Date('YYYY-MM-DD') al parsear en UTC).
function parseDay(value: string, field: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Fecha inválida en "${field}": ${value}`);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function format(d: Date, endOfDay: boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return endOfDay ? `${date} 23:59:59` : `${date} 00:00:00`;
}
