// pdfkit exporta por CommonJS y el proyecto compila sin esModuleInterop: con
// `import ... from` el default queda undefined en runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { drawNorthArCredit, PDF_CREATOR } from './northar-credit';

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
// Sobria a propósito: el azul marino es el único color de marca y los estados
// van en tonos apagados, contorneados y no en bloques llenos.
const COLOR = {
  primary: '#1F3A5F',
  ink: '#1F2933',
  muted: '#6B7280',
  line: '#E2E6EC',
  band: '#F1F4F8',
  soft: '#F8FAFC',
  white: '#FFFFFF',
};

/** Colores de los chips de estado: texto/contorno sobre fondo. */
const TONE = {
  ok: { fg: '#2E7D5B', bg: '#F1F8F4' },
  warn: { fg: '#B54708', bg: '#FEF6EE' },
  danger: { fg: '#B42318', bg: '#FDF2F1' },
  neutral: { fg: '#6B7280', bg: '#F8FAFC' },
};

/** Radio máximo de las esquinas. */
const RADIUS = 4;

const FONT = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

const PAGE = {
  margins: { top: 136, bottom: 64, left: 40, right: 40 },
  /** Alto de la franja de color en el borde superior de cada hoja. */
  topBand: 4,
  headerTop: 30,
  /** Distancia del filete del pie al borde inferior de la hoja. */
  footerOffset: 50,
};

const TZ = 'America/Argentina/Buenos_Aires';

/**
 * Membrete del comprobante: los datos de la empresa que lo emite.
 *
 * Los provee `PdfCompanyService` leyendo la empresa del usuario. Antes salían
 * de variables de entorno, que describen una instalación y no un cliente: con
 * varias empresas en el mismo servidor, todas recibían el membrete de la
 * primera que se hubiera configurado.
 *
 * Es obligatorio y no tiene valor por defecto a propósito. Un default acá
 * volvería a producir el mismo error, pero silencioso: el PDF saldría bien,
 * con el nombre de otro.
 */
export interface PdfCompany {
  name: string;
  /** Ya formateado para imprimir ("CUIT 30-…"); vacío si no hay dato. */
  taxId: string;
  address: string;
  contact: string;
  /**
   * Logo ya descargado. Se recibe el contenido y no una ruta ni una URL:
   * este archivo dibuja, no sabe de S3 ni del disco. Sin logo se dibuja un
   * recuadro con las iniciales, que ocupa exactamente el mismo espacio.
   */
  logo?: Buffer;
}

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
  /** Empresa que emite el comprobante. Ver `PdfCompany`. */
  company: PdfCompany;
  /** Título del comprobante ("Liquidación de viaje"). */
  title: string;
  /** Identificador del comprobante (código de viaje, nro. de liquidación). */
  docId?: string;
  /** Bajada corta debajo del título. */
  subtitle?: string;
  /** Estado a mostrar como chip en el encabezado. */
  badge?: { text: string; tone?: keyof typeof TONE };
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
  /**
   * Cómo se destaca `totalRow`. Por defecto es un subtotal (banda gris); con
   * `'total'` va en la banda azul, para cuando esa fila es el total del
   * documento y no hay panel de `totals()` después.
   */
  totalStyle?: 'subtotal' | 'total';
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
        Author: meta.company.name,
        Subject: sanitize(meta.subtitle || meta.docId || meta.title),
        Creator: PDF_CREATOR,
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
    const co = this.meta.company;
    const left = PAGE.margins.left;
    const right = doc.page.width - PAGE.margins.right;
    const top = PAGE.headerTop;

    // Franja de color a todo el ancho de la hoja.
    doc
      .rect(0, 0, doc.page.width, PAGE.topBand)
      .fillColor(COLOR.primary)
      .fill();

    this.drawLogo(left, top);

    // Datos de la empresa, a la derecha del logo.
    const infoX = left + 104;
    doc.font(FONT.bold).fontSize(11.5).fillColor(COLOR.ink);
    doc.text(sanitize(co.name), infoX, top + 2, { width: 200 });
    doc.y += 1;
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLOR.muted);
    [co.taxId, co.address, co.contact]
      .filter(Boolean)
      .forEach((line) =>
        doc.text(sanitize(line), infoX, doc.y, { width: 200 }),
      );

    // Bloque del comprobante, alineado a la derecha: el tipo de documento chico
    // y espaciado, y debajo el número grande.
    const boxW = 210;
    const boxX = right - boxW;
    this.textRight(sanitize(this.meta.title).toUpperCase(), right, top, {
      font: FONT.bold,
      size: 7.5,
      color: COLOR.muted,
      spacing: 1.6,
    });
    doc.y = top + 12;
    if (this.meta.docId) {
      doc.font(FONT.bold).fontSize(17).fillColor(COLOR.primary);
      doc.text(sanitize(this.meta.docId), boxX, doc.y, {
        width: boxW,
        align: 'right',
      });
      doc.y += 2;
    }
    if (this.meta.subtitle) {
      doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.ink);
      doc.text(sanitize(this.meta.subtitle), boxX, doc.y, {
        width: boxW,
        align: 'right',
      });
    }
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLOR.muted);
    doc.text(
      `${this.meta.dataDateLabel || 'Fecha del comprobante'}: ${dateOnly(
        this.meta.dataDate ?? this.generatedAt,
      )}`,
      boxX,
      doc.y + 1,
      { width: boxW, align: 'right' },
    );
    doc.text(`Generado: ${dateTime(this.generatedAt)}`, boxX, doc.y, {
      width: boxW,
      align: 'right',
    });

    if (this.meta.badge) this.drawBadge(right);

    // Filete inferior del encabezado.
    const ruleY = PAGE.margins.top - 12;
    doc
      .moveTo(left, ruleY)
      .lineTo(right, ruleY)
      .lineWidth(0.8)
      .strokeColor(COLOR.primary)
      .stroke();

    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    doc.x = left;
    doc.y = PAGE.margins.top;
  }

  /**
   * Texto de una línea alineado a la derecha midiendo su ancho. Con
   * `characterSpacing`, el ajuste de línea de pdfkit cuenta un espaciado de más
   * y el texto no queda a ras del resto del bloque.
   */
  private textRight(
    text: string,
    right: number,
    y: number,
    o: { font: string; size: number; color: string; spacing?: number },
  ): void {
    const { doc } = this;
    const spacing = o.spacing ?? 0;
    doc.font(o.font).fontSize(o.size).fillColor(o.color);
    const w = doc.widthOfString(text, { characterSpacing: spacing });
    doc.text(text, right - w, y, {
      lineBreak: false,
      characterSpacing: spacing,
    });
  }

  private drawLogo(x: number, y: number): void {
    const { doc } = this;
    const co = this.meta.company;
    const w = 92;
    const h = 46;

    if (co.logo) {
      try {
        doc.image(co.logo, x, y, { fit: [w, h] });
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
    doc.roundedRect(x, y, w, h, RADIUS).fillColor(COLOR.band).fill();
    doc.font(FONT.bold).fontSize(16).fillColor(COLOR.primary);
    doc.text(initials || 'CX', x, y + h / 2 - 7, { width: w, align: 'center' });
    doc.restore();
  }

  private drawBadge(right: number): void {
    const { doc } = this;
    const badge = this.meta.badge!;
    const tone = TONE[badge.tone ?? 'neutral'];
    const text = sanitize(badge.text).toUpperCase();
    const spacing = 0.6;
    doc.font(FONT.bold).fontSize(6.5);
    const textW = doc.widthOfString(text, { characterSpacing: spacing });
    const h = 12;
    const w = textW + 14;
    const x = right - w;
    const y = doc.y + 4;
    doc
      .roundedRect(x, y, w, h, 2)
      .lineWidth(0.6)
      .fillColor(tone.bg)
      .strokeColor(tone.fg)
      .fillAndStroke();
    doc.fillColor(tone.fg).text(text, x + 7, y + 3.4, {
      lineBreak: false,
      characterSpacing: spacing,
    });
    doc.y = y + h + 2;
  }

  private drawFooters(): void {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    const co = this.meta.company;

    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const ruleY = doc.page.height - PAGE.footerOffset;
      const left = PAGE.margins.left;
      const width = this.contentWidth;

      // El pie se escribe por debajo del margen inferior: sin esto, pdfkit lo
      // interpreta como desborde y agrega una página en blanco por cada línea.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc
        .moveTo(left, ruleY)
        .lineTo(left + width, ruleY)
        .lineWidth(0.5)
        .strokeColor(COLOR.line)
        .stroke();

      // Textos del pie a la izquierda, numeración a la derecha.
      const textY = ruleY + 6;
      const noteW = width * 0.78;
      const note =
        this.meta.footerNote ||
        `Documento generado automáticamente por ${co.name}. Sin valor fiscal.`;
      const footerText = sanitize(
        `${note}  ·  Emitido ${dateTime(this.generatedAt)}`,
      );
      doc.font(FONT.regular).fontSize(7).fillColor(COLOR.muted);
      const textH = doc.heightOfString(footerText, { width: noteW });
      doc.text(footerText, left, textY, { width: noteW });
      doc.text(`Página ${i + 1} de ${range.count}`, left + noteW, textY, {
        width: width - noteW,
        align: 'right',
        lineBreak: false,
      });

      // La firma va pegada debajo del texto del pie, sin espacio de más.
      drawNorthArCredit(doc, left + width / 2, textY + textH + 3);

      doc.page.margins.bottom = bottomMargin;
    }
  }

  // ── Bloques de contenido ──────────────────────────────────────────────────

  /** Reserva espacio: si no entra, abre página nueva (con su encabezado). */
  private ensure(height: number): void {
    if (this.doc.y + height > this.bottomLimit) this.doc.addPage();
  }

  /** Título de sección con filete vertical de color. */
  section(title: string, gapBefore = 14): this {
    const { doc } = this;
    // El título más el arranque de lo que sigue (encabezado de tabla y una
    // fila): si no, el título queda solo al pie y su contenido en la otra hoja.
    this.ensure(gapBefore + 18 + 44);
    if (doc.y > PAGE.margins.top) doc.y += gapBefore;
    const y = doc.y;
    doc.rect(PAGE.margins.left, y, 2, 11).fillColor(COLOR.primary).fill();
    doc
      .font(FONT.bold)
      .fontSize(8.5)
      .fillColor(COLOR.ink)
      .text(sanitize(title).toUpperCase(), PAGE.margins.left + 8, y + 2, {
        width: this.contentWidth - 8,
        characterSpacing: 1.2,
      });
    doc.y = y + 18;
    doc.x = PAGE.margins.left;
    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    return this;
  }

  /**
   * Grilla de etiqueta/valor en columnas, dentro de un recuadro gris claro.
   *
   * Primero se arman las filas y se reparten entre páginas, y recién después
   * se dibuja: el fondo del recuadro tiene que ir antes que el texto y su alto
   * depende de cuántas filas entren en cada hoja.
   */
  fields(items: Field[], cols = 3): this {
    const { doc } = this;
    const pad = 10;
    const gap = 12;
    const rowGap = 8;
    const labelH = 10;
    const innerW = this.contentWidth - pad * 2;
    const colW = (innerW - gap * (cols - 1)) / cols;

    type Cell = { x: number; width: number; label: string; value: string };
    const rows: { cells: Cell[]; height: number }[] = [];
    let current: Cell[] = [];
    let currentH = 0;
    let col = 0;
    const flush = () => {
      if (current.length) rows.push({ cells: current, height: currentH });
      current = [];
      currentH = 0;
      col = 0;
    };

    doc.font(FONT.bold).fontSize(8.5);
    for (const item of items) {
      const span = item.full ? cols : 1;
      if (col > 0 && col + span > cols) flush();
      const width = colW * span + gap * (span - 1);
      const value = sanitize(item.value ?? '') || '-';
      current.push({
        x: PAGE.margins.left + pad + col * (colW + gap),
        width,
        label: sanitize(item.label).toUpperCase(),
        value,
      });
      currentH = Math.max(
        currentH,
        labelH + doc.heightOfString(value, { width }),
      );
      col += span;
      if (col >= cols) flush();
    }
    flush();

    // Reparto entre páginas: cada tramo es un recuadro.
    let i = 0;
    while (i < rows.length) {
      if (doc.y + pad * 2 + rows[i].height > this.bottomLimit) {
        doc.addPage();
      }
      const top = doc.y;
      let bottom = top + pad;
      const segment: { y: number; row: (typeof rows)[number] }[] = [];
      while (
        i < rows.length &&
        (segment.length === 0 ||
          bottom + rowGap + rows[i].height + pad <= this.bottomLimit)
      ) {
        if (segment.length) bottom += rowGap;
        segment.push({ y: bottom, row: rows[i] });
        bottom += rows[i].height;
        i++;
      }
      bottom += pad;

      doc
        .roundedRect(
          PAGE.margins.left,
          top,
          this.contentWidth,
          bottom - top,
          RADIUS,
        )
        .lineWidth(0.5)
        .fillColor(COLOR.soft)
        .strokeColor(COLOR.line)
        .fillAndStroke();

      for (const { y, row } of segment) {
        for (const cell of row.cells) {
          doc.font(FONT.regular).fontSize(6.5).fillColor(COLOR.muted);
          doc.text(cell.label, cell.x, y, {
            width: cell.width,
            characterSpacing: 0.6,
            lineBreak: false,
            ellipsis: true,
          });
          doc.font(FONT.bold).fontSize(8.5).fillColor(COLOR.ink);
          doc.text(cell.value, cell.x, y + labelH, { width: cell.width });
        }
      }
      doc.y = bottom + (i < rows.length ? 0 : 2);
    }

    doc.x = PAGE.margins.left;
    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    return this;
  }

  /** Tabla con encabezado repetido en cada página y fila de total. */
  table(opts: TableOptions): this {
    const { doc } = this;
    const fontSize = opts.fontSize ?? 8.5;
    const padX = 6;
    const padY = 5;
    const headH = 18;
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
      this.ensure(headH + 20);
      const y = doc.y;
      doc
        .rect(PAGE.margins.left, y, this.contentWidth, headH)
        .fillColor(COLOR.primary)
        .fill();
      doc
        .font(FONT.bold)
        .fontSize(fontSize - 1.5)
        .fillColor(COLOR.white);
      opts.columns.forEach((c, i) => {
        doc.text(sanitize(c.label).toUpperCase(), xs[i] + padX, y + 6.5, {
          width: widths[i] - padX * 2,
          align: c.align ?? 'left',
          lineBreak: false,
          characterSpacing: 0.5,
        });
      });
      doc.y = y + headH;
    };

    const drawRow = (
      cells: unknown[],
      style: 'row' | 'subtotal' | 'total' = 'row',
    ) => {
      const bold = style !== 'row';
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
      if (style !== 'row') {
        doc
          .rect(PAGE.margins.left, y, this.contentWidth, h)
          .fillColor(style === 'total' ? COLOR.primary : COLOR.band)
          .fill();
      }

      doc
        .font(bold ? FONT.bold : FONT.regular)
        .fontSize(fontSize)
        .fillColor(style === 'total' ? COLOR.white : COLOR.ink);
      texts.forEach((t, i) => {
        doc.text(t, xs[i] + padX, y + padY, {
          width: widths[i] - padX * 2,
          align: opts.columns[i].align ?? 'left',
        });
      });

      if (style === 'row') {
        doc
          .moveTo(PAGE.margins.left, y + h)
          .lineTo(PAGE.margins.left + this.contentWidth, y + h)
          .lineWidth(0.5)
          .strokeColor(COLOR.line)
          .stroke();
      }
      doc.y = y + h;
    };

    drawHeadRow();
    if (!opts.rows.length) {
      doc.font(FONT.italic).fontSize(fontSize).fillColor(COLOR.muted);
      const text = sanitize(opts.emptyText || 'Sin movimientos registrados.');
      const y = doc.y;
      doc.text(text, PAGE.margins.left + padX, y + padY, {
        width: this.contentWidth - padX * 2,
      });
      doc.y += padY;
      doc
        .moveTo(PAGE.margins.left, doc.y)
        .lineTo(PAGE.margins.left + this.contentWidth, doc.y)
        .lineWidth(0.5)
        .strokeColor(COLOR.line)
        .stroke();
    } else {
      opts.rows.forEach((row) => drawRow(row));
    }
    if (opts.totalRow) drawRow(opts.totalRow, opts.totalStyle ?? 'subtotal');

    doc.x = PAGE.margins.left;
    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
    return this;
  }

  /**
   * Panel de totales alineado a la derecha: los subtotales en gris y la fila
   * destacada en una banda de color.
   */
  totals(rows: { label: string; value: string; strong?: boolean }[]): this {
    const { doc } = this;
    const w = 260;
    const x = doc.page.width - PAGE.margins.right - w;
    const lineH = 17;
    const strongH = 26;
    const height = rows.reduce((a, r) => a + (r.strong ? strongH : lineH), 0);

    this.ensure(height + 12);
    doc.y += 12;
    const top = doc.y;
    let y = top;

    rows.forEach((r) => {
      const strong = !!r.strong;
      const h = strong ? strongH : lineH;
      if (strong) {
        doc.roundedRect(x, y, w, h, RADIUS).fillColor(COLOR.primary).fill();
      } else {
        doc
          .moveTo(x, y + h)
          .lineTo(x + w, y + h)
          .lineWidth(0.5)
          .strokeColor(COLOR.line)
          .stroke();
      }
      const size = strong ? 10.5 : 8.5;
      const textY = y + (h - size) / 2 + 1;
      doc
        .font(strong ? FONT.bold : FONT.regular)
        .fontSize(size)
        .fillColor(strong ? COLOR.white : COLOR.muted);
      doc.text(sanitize(r.label), x + 10, textY, {
        width: w * 0.55 - 10,
        lineBreak: false,
      });
      doc.font(FONT.bold);
      doc.text(sanitize(r.value), x + w * 0.55, textY, {
        width: w * 0.45 - 10,
        align: 'right',
        lineBreak: false,
      });
      y += h;
    });

    doc.y = top + height;
    doc.x = PAGE.margins.left;
    doc.fillColor(COLOR.ink).font(FONT.regular).fontSize(9);
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
        .strokeColor(COLOR.muted)
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
