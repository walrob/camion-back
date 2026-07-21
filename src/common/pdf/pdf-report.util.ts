import * as fs from 'fs';
// pdfkit exporta por CommonJS y el proyecto compila sin esModuleInterop: con
// `import ... from` el default queda undefined en runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');

/**
 * Base para los comprobantes en PDF del sistema (liquidaciones, y lo que venga
 * después). Resuelve lo que todo comprobante necesita y que es tedioso de
 * repetir con pdfkit crudo: encabezado con logo en todas las páginas, pie con
 * fecha de generación y "Página X de Y", secciones, grillas de datos, tablas
 * con salto de página y panel de totales.
 *
 * Uso:
 *   const report = new PdfReport({ title: '...', docId: '...' });
 *   report.section('Datos'); report.fields([...]); report.table({...});
 *   const buffer = await report.finish();
 */

// ── Identidad visual ────────────────────────────────────────────────────────
const COLOR = {
  primary: '#0F3D5C',
  ink: '#1F2933',
  muted: '#6B7280',
  line: '#D7DDE3',
  band: '#EEF3F7',
  zebra: '#F7F9FB',
  ok: '#0B6E4F',
  warn: '#B45309',
};

const FONT = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

const PAGE = {
  margins: { top: 124, bottom: 64, left: 40, right: 40 },
  headerTop: 32,
  /** Distancia del pie al borde inferior de la hoja. */
  footerOffset: 44,
};

const TZ = 'America/Argentina/Buenos_Aires';

/**
 * Datos de la empresa para el encabezado. Vienen de variables de entorno para
 * no hardcodear el cliente; el logo se agrega apoyando un archivo en
 * COMPANY_LOGO_PATH (png/jpg). Mientras no exista, se dibuja un placeholder con
 * las iniciales, así el diseño ya reserva el espacio definitivo.
 */
const company = () => ({
  name: process.env.COMPANY_NAME || 'FleetLog',
  taxId: process.env.COMPANY_TAX_ID || '',
  address: process.env.COMPANY_ADDRESS || '',
  contact: process.env.COMPANY_CONTACT || '',
  logoPath: process.env.COMPANY_LOGO_PATH || '',
});

// ── Formateadores ───────────────────────────────────────────────────────────

/** Caracteres fuera de Latin-1 que las fuentes estándar de pdfkit sí soportan. */
const WIN_ANSI_EXTRA = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
    0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
    0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ].map((c) => String.fromCharCode(c)),
);

const REPLACEMENTS: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '✓': 'OK',
  '✔': 'OK',
  '✗': 'X',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  ' ': ' ',
};

/**
 * Las fuentes estándar de pdfkit usan WinAnsi: un carácter fuera de esa tabla
 * sale como basura (el "→" del recorrido se imprimía como "!'"). Se traduce lo
 * traducible y se descarta el resto antes de escribir.
 */
export const sanitize = (value: unknown): string => {
  const text =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? dateTime(value)
        : typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : ''; // objetos: no hay representación útil en un comprobante
  return [...text]
    .map((ch) => {
      if (REPLACEMENTS[ch] !== undefined) return REPLACEMENTS[ch];
      if (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(ch)) return ch;
      return '';
    })
    .join('');
};

/** Formato argentino: miles con punto y decimales con coma ("$ 1.234,50"). */
export const money = (n: unknown, currency = 'ARS'): string =>
  sanitize(
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n) || 0),
  );

export const number = (n: unknown, decimals = 0): string =>
  n === null || n === undefined || n === ''
    ? '-'
    : new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(Number(n) || 0);

export const dateOnly = (value?: Date | string | null): string => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ,
  }).format(d);
};

export const dateTime = (value?: Date | string | null): string => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return sanitize(
    new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false, // "17:38" y no "05:38 p. m."
      timeZone: TZ,
    }).format(d),
  ).replace(',', '');
};

// ── Tipos públicos ──────────────────────────────────────────────────────────

export interface PdfMeta {
  /** Título del comprobante ("Liquidación de viaje"). */
  title: string;
  /** Identificador del comprobante (código de viaje, nro. de liquidación). */
  docId?: string;
  /** Bajada corta debajo del título. */
  subtitle?: string;
  /** Estado a mostrar como chip en el encabezado. */
  badge?: { text: string; tone?: 'ok' | 'warn' | 'neutral' };
  /**
   * Fecha a la que corresponden los datos (emisión / corte). Se imprime en el
   * encabezado junto a la fecha de generación para que no se confundan.
   */
  dataDate?: Date | string | null;
  dataDateLabel?: string;
  /** Nota al pie, además del sello de generación automática. */
  footerNote?: string;
}

export interface Field {
  label: string;
  value: unknown;
  /** Ocupa el ancho de la grilla completa (para notas largas). */
  full?: boolean;
}

export interface Column {
  label: string;
  /** Peso relativo del ancho; se normaliza contra el ancho útil. */
  width: number;
  align?: 'left' | 'right' | 'center';
}

export interface TableOptions {
  columns: Column[];
  rows: unknown[][];
  /** Fila de cierre en negrita (totales de la tabla). */
  totalRow?: unknown[];
  /** Texto cuando no hay filas. */
  emptyText?: string;
  fontSize?: number;
}

// ── Reporte ─────────────────────────────────────────────────────────────────

export class PdfReport {
  readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];
  private readonly closed: Promise<Buffer>;
  private readonly generatedAt = new Date();

  constructor(private readonly meta: PdfMeta) {
    this.doc = new PDFDocument({
      size: 'A4',
      margins: PAGE.margins,
      bufferPages: true, // necesario para numerar "Página X de Y" al cerrar
      info: {
        Title: sanitize(meta.title),
        Author: company().name,
        Subject: sanitize(meta.subtitle || meta.docId || meta.title),
        CreationDate: this.generatedAt,
      },
    });

    this.doc.on('data', (c: Buffer) => this.chunks.push(c));
    this.closed = new Promise<Buffer>((resolve) =>
      this.doc.on('end', () => resolve(Buffer.concat(this.chunks))),
    );

    // El encabezado se repite en cada página; el pie se dibuja al final, cuando
    // ya se conoce la cantidad total de páginas.
    this.doc.on('pageAdded', () => this.drawHeader());
    this.drawHeader();
  }

  private get contentWidth(): number {
    return this.doc.page.width - PAGE.margins.left - PAGE.margins.right;
  }

  private get bottomLimit(): number {
    return this.doc.page.height - PAGE.margins.bottom;
  }

  // ── Encabezado / pie ──────────────────────────────────────────────────────

  private drawHeader(): void {
    const { doc } = this;
    const co = company();
    const left = PAGE.margins.left;
    const right = doc.page.width - PAGE.margins.right;
    const top = PAGE.headerTop;

    this.drawLogo(left, top);

    // Datos de la empresa, a la derecha del logo.
    const infoX = left + 104;
    doc.font(FONT.bold).fontSize(12).fillColor(COLOR.primary);
    doc.text(sanitize(co.name), infoX, top + 2, { width: 200 });
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLOR.muted);
    [co.taxId, co.address, co.contact]
      .filter(Boolean)
      .forEach((line) =>
        doc.text(sanitize(line), infoX, doc.y, { width: 200 }),
      );

    // Bloque del comprobante, alineado a la derecha.
    const boxW = 210;
    const boxX = right - boxW;
    doc.font(FONT.bold).fontSize(15).fillColor(COLOR.ink);
    doc.text(sanitize(this.meta.title).toUpperCase(), boxX, top, {
      width: boxW,
      align: 'right',
    });

    doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted);
    if (this.meta.docId) {
      doc.font(FONT.bold).fontSize(9.5).fillColor(COLOR.primary);
      doc.text(sanitize(this.meta.docId), boxX, doc.y + 1, {
        width: boxW,
        align: 'right',
      });
      doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted);
    }
    if (this.meta.subtitle) {
      doc.text(sanitize(this.meta.subtitle), boxX, doc.y, {
        width: boxW,
        align: 'right',
      });
    }
    doc.text(
      `${this.meta.dataDateLabel || 'Fecha del comprobante'}: ${dateOnly(
        this.meta.dataDate ?? this.generatedAt,
      )}`,
      boxX,
      doc.y,
      { width: boxW, align: 'right' },
    );
    doc.text(`Generado: ${dateTime(this.generatedAt)}`, boxX, doc.y, {
      width: boxW,
      align: 'right',
    });

    if (this.meta.badge) this.drawBadge(boxX, boxW);

    // Filete inferior del encabezado.
    const ruleY = PAGE.margins.top - 11;
    doc
      .moveTo(left, ruleY)
      .lineTo(right, ruleY)
      .lineWidth(1.5)
      .strokeColor(COLOR.primary)
      .stroke();

    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    doc.x = left;
    doc.y = PAGE.margins.top;
  }

  private drawLogo(x: number, y: number): void {
    const { doc } = this;
    const co = company();
    const w = 92;
    const h = 46;

    if (co.logoPath && fs.existsSync(co.logoPath)) {
      try {
        doc.image(co.logoPath, x, y, { fit: [w, h] });
        return;
      } catch {
        // Si el archivo no es una imagen válida, cae al placeholder.
      }
    }

    // Placeholder: reserva el espacio exacto que ocupará el logo definitivo.
    const initials = sanitize(co.name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');
    doc.save();
    doc
      .roundedRect(x, y, w, h, 4)
      .lineWidth(1)
      .dash(3, { space: 2 })
      .strokeColor(COLOR.line)
      .stroke();
    doc.undash();
    doc.font(FONT.bold).fontSize(16).fillColor(COLOR.primary);
    doc.text(initials || 'FL', x, y + h / 2 - 9, { width: w, align: 'center' });
    doc.restore();
  }

  private drawBadge(boxX: number, boxW: number): void {
    const { doc } = this;
    const badge = this.meta.badge!;
    const tone =
      badge.tone === 'ok'
        ? COLOR.ok
        : badge.tone === 'warn'
          ? COLOR.warn
          : COLOR.muted;
    const text = sanitize(badge.text).toUpperCase();
    doc.font(FONT.bold).fontSize(7.5);
    const w = doc.widthOfString(text) + 14;
    const x = boxX + boxW - w;
    const y = doc.y + 3;
    doc.roundedRect(x, y, w, 13, 6.5).lineWidth(0.8).strokeColor(tone).stroke();
    doc.fillColor(tone).text(text, x, y + 3.5, { width: w, align: 'center' });
    doc.y = y + 15;
  }

  private drawFooters(): void {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    const co = company();

    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const y = doc.page.height - PAGE.footerOffset;
      const left = PAGE.margins.left;
      const width = this.contentWidth;

      // El pie se escribe por debajo del margen inferior: sin esto, pdfkit lo
      // interpreta como desborde y agrega una página en blanco por cada línea.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc
        .moveTo(left, y - 8)
        .lineTo(left + width, y - 8)
        .lineWidth(0.5)
        .strokeColor(COLOR.line)
        .stroke();

      doc.font(FONT.regular).fontSize(7).fillColor(COLOR.muted);
      const note =
        this.meta.footerNote ||
        `Documento generado automáticamente por ${co.name}. Sin valor fiscal.`;
      doc.text(sanitize(note), left, y, { width: width * 0.7 });
      doc.text(
        `Emitido ${dateTime(this.generatedAt)}  ·  Página ${i + 1} de ${range.count}`,
        left + width * 0.7,
        y,
        { width: width * 0.3, align: 'right' },
      );

      doc.page.margins.bottom = bottomMargin;
    }
  }

  // ── Bloques de contenido ──────────────────────────────────────────────────

  /** Reserva espacio: si no entra, abre página nueva (con su encabezado). */
  private ensure(height: number): void {
    if (this.doc.y + height > this.bottomLimit) this.doc.addPage();
  }

  /** Título de sección con barra de color. */
  section(title: string, gapBefore = 14): this {
    const { doc } = this;
    this.ensure(34);
    doc.y += gapBefore;
    const y = doc.y;
    doc.rect(PAGE.margins.left, y, 3, 12).fillColor(COLOR.primary).fill();
    doc
      .font(FONT.bold)
      .fontSize(10)
      .fillColor(COLOR.primary)
      .text(sanitize(title).toUpperCase(), PAGE.margins.left + 9, y + 1.5, {
        width: this.contentWidth - 9,
        characterSpacing: 0.4,
      });
    doc.y = y + 18;
    doc.x = PAGE.margins.left;
    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    return this;
  }

  /** Grilla de etiqueta/valor en columnas. */
  fields(items: Field[], cols = 3): this {
    const { doc } = this;
    const gap = 10;
    const colW = (this.contentWidth - gap * (cols - 1)) / cols;
    let col = 0;
    let rowTop = doc.y;
    let rowH = 0;

    const flushRow = () => {
      doc.y = rowTop + rowH + 8;
      rowTop = doc.y;
      rowH = 0;
      col = 0;
    };

    for (const item of items) {
      const span = item.full ? cols : 1;
      if (col > 0 && col + span > cols) flushRow();

      const width = colW * span + gap * (span - 1);
      const x = PAGE.margins.left + col * (colW + gap);
      const value = sanitize(item.value ?? '') || '-';

      const valueH = doc
        .font(FONT.regular)
        .fontSize(9)
        .heightOfString(value, { width });
      const cellH = 11 + valueH;
      if (rowTop + cellH > this.bottomLimit) {
        doc.addPage();
        rowTop = doc.y;
        rowH = 0;
        col = 0;
      }

      doc.font(FONT.regular).fontSize(6.8).fillColor(COLOR.muted);
      doc.text(sanitize(item.label).toUpperCase(), x, rowTop, {
        width,
        characterSpacing: 0.3,
      });
      doc.font(FONT.bold).fontSize(9).fillColor(COLOR.ink);
      doc.text(value, x, rowTop + 10, { width });

      rowH = Math.max(rowH, cellH);
      col += span;
      if (col >= cols) flushRow();
    }

    if (col > 0) flushRow();
    doc.x = PAGE.margins.left;
    return this;
  }

  /** Tabla con encabezado repetido en cada página, zebra y fila de total. */
  table(opts: TableOptions): this {
    const { doc } = this;
    const fontSize = opts.fontSize ?? 8.5;
    const padX = 5;
    const padY = 4;
    const totalWeight = opts.columns.reduce((a, c) => a + c.width, 0);
    const widths = opts.columns.map(
      (c) => (c.width / totalWeight) * this.contentWidth,
    );
    const xs = widths.reduce<number[]>(
      (acc, w, i) => [
        ...acc,
        i === 0 ? PAGE.margins.left : acc[i - 1] + widths[i - 1],
      ],
      [],
    );

    const drawHeadRow = () => {
      this.ensure(20);
      const y = doc.y;
      doc
        .rect(PAGE.margins.left, y, this.contentWidth, 17)
        .fillColor(COLOR.primary)
        .fill();
      doc
        .font(FONT.bold)
        .fontSize(fontSize - 0.5)
        .fillColor('#FFFFFF');
      opts.columns.forEach((c, i) => {
        doc.text(sanitize(c.label).toUpperCase(), xs[i] + padX, y + 5, {
          width: widths[i] - padX * 2,
          align: c.align ?? 'left',
          lineBreak: false,
        });
      });
      doc.y = y + 17;
    };

    const drawRow = (cells: unknown[], index: number, bold = false) => {
      // Celda nula = dato inexistente ("-"); cadena vacía = celda a propósito en
      // blanco (columnas que no aplican en la fila de totales).
      const texts = cells.map((c) =>
        c === null || c === undefined ? '-' : sanitize(c),
      );
      doc.font(bold ? FONT.bold : FONT.regular).fontSize(fontSize);
      const h =
        Math.max(
          ...texts.map((t, i) =>
            doc.heightOfString(t, { width: widths[i] - padX * 2 }),
          ),
        ) +
        padY * 2;

      if (doc.y + h > this.bottomLimit) {
        doc.addPage();
        drawHeadRow();
      }

      const y = doc.y;
      if (bold) {
        doc
          .rect(PAGE.margins.left, y, this.contentWidth, h)
          .fillColor(COLOR.band)
          .fill();
      } else if (index % 2 === 1) {
        doc
          .rect(PAGE.margins.left, y, this.contentWidth, h)
          .fillColor(COLOR.zebra)
          .fill();
      }

      doc
        .font(bold ? FONT.bold : FONT.regular)
        .fontSize(fontSize)
        .fillColor(COLOR.ink);
      texts.forEach((t, i) => {
        doc.text(t, xs[i] + padX, y + padY, {
          width: widths[i] - padX * 2,
          align: opts.columns[i].align ?? 'left',
        });
      });

      doc
        .moveTo(PAGE.margins.left, y + h)
        .lineTo(PAGE.margins.left + this.contentWidth, y + h)
        .lineWidth(0.4)
        .strokeColor(COLOR.line)
        .stroke();
      doc.y = y + h;
    };

    drawHeadRow();
    if (!opts.rows.length) {
      doc.font(FONT.italic).fontSize(fontSize).fillColor(COLOR.muted);
      const text = sanitize(opts.emptyText || 'Sin movimientos registrados.');
      doc.text(text, PAGE.margins.left + padX, doc.y + padY, {
        width: this.contentWidth - padX * 2,
      });
      doc.y += padY;
    } else {
      opts.rows.forEach((row, i) => drawRow(row, i));
    }
    if (opts.totalRow) drawRow(opts.totalRow, 0, true);

    doc.x = PAGE.margins.left;
    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    return this;
  }

  /** Panel de totales alineado a la derecha; la última fila va destacada. */
  totals(rows: { label: string; value: string; strong?: boolean }[]): this {
    const { doc } = this;
    const w = 260;
    const x = doc.page.width - PAGE.margins.right - w;
    const lineH = 16;
    const strongH = 24;
    const height =
      rows.reduce((a, r) => a + (r.strong ? strongH : lineH), 0) + 12;

    this.ensure(height + 10);
    doc.y += 10;
    const top = doc.y;
    doc.rect(x, top, w, height).fillColor(COLOR.band).fill();
    doc.rect(x, top, w, height).lineWidth(0.6).strokeColor(COLOR.line).stroke();

    let y = top + 6;
    rows.forEach((r) => {
      const strong = !!r.strong;
      if (strong) {
        doc
          .moveTo(x + 8, y + 1)
          .lineTo(x + w - 8, y + 1)
          .lineWidth(0.6)
          .strokeColor(COLOR.line)
          .stroke();
        y += 5;
      }
      doc
        .font(strong ? FONT.bold : FONT.regular)
        .fontSize(strong ? 11 : 9)
        .fillColor(strong ? COLOR.primary : COLOR.ink);
      doc.text(sanitize(r.label), x + 10, y, { width: w * 0.55 - 10 });
      doc.text(sanitize(r.value), x + w * 0.55, y, {
        width: w * 0.45 - 10,
        align: 'right',
      });
      y += strong ? strongH - 5 : lineH;
    });

    doc.y = top + height;
    doc.x = PAGE.margins.left;
    return this;
  }

  /** Párrafo suelto (aclaraciones, observaciones). */
  paragraph(
    text: string,
    opts: { muted?: boolean; italic?: boolean } = {},
  ): this {
    const { doc } = this;
    const content = sanitize(text);
    doc.font(opts.italic ? FONT.italic : FONT.regular).fontSize(8.5);
    this.ensure(doc.heightOfString(content, { width: this.contentWidth }) + 6);
    doc.fillColor(opts.muted ? COLOR.muted : COLOR.ink);
    doc.text(content, PAGE.margins.left, doc.y + 4, {
      width: this.contentWidth,
    });
    doc.fillColor(COLOR.ink);
    return this;
  }

  /** Líneas de firma al pie del comprobante. */
  signatures(labels: string[]): this {
    const { doc } = this;
    const gap = 40;
    const w = (this.contentWidth - gap * (labels.length - 1)) / labels.length;
    // Espacio en blanco suficiente arriba de la línea para firmar y aclarar a
    // mano; si no entra en la página, la firma va entera en la siguiente.
    const space = 80;
    this.ensure(space + 30);
    const y = doc.y + space;
    labels.forEach((label, i) => {
      const x = PAGE.margins.left + i * (w + gap);
      doc
        .moveTo(x, y)
        .lineTo(x + w, y)
        .lineWidth(0.6)
        .strokeColor(COLOR.line)
        .stroke();
      doc.font(FONT.regular).fontSize(7.5).fillColor(COLOR.muted);
      doc.text(sanitize(label), x, y + 5, { width: w, align: 'center' });
    });
    doc.y = y + 24;
    return this;
  }

  /** Cierra el documento (dibujando los pies) y devuelve el buffer. */
  async finish(): Promise<Buffer> {
    this.drawFooters();
    this.doc.end();
    return this.closed;
  }
}
