/**
 * Firma de NorthAr al pie de todos los PDF del sistema.
 *
 * Vive acá, con valores fijos, y no en `PdfMeta` ni en `PdfCompany` a
 * propósito: lo que viaja en esos tipos lo decide cada cliente (su membrete,
 * su nota al pie) y la firma no es configurable por cliente. `PdfReport` la
 * dibuja siempre, sin opción para omitirla.
 */

const PRODUCT = { name: 'CamioNex', url: 'https://www.camionex.com.ar' };
const NORTHAR = {
  name: 'NorthAr Consulting',
  url: 'https://www.northar.com.ar',
  label: 'www.northar.com.ar',
};

/** Valor del campo Creator de los metadatos del PDF. */
export const PDF_CREATOR = `${PRODUCT.name} · ${NORTHAR.name}`;

export const CREDIT_FONT = 'Helvetica';
export const CREDIT_FONT_SIZE = 6.5;
const CREDIT_COLOR = '#6B7280';

/** Tramos de la línea; los que llevan `url` son links. */
const SEGMENTS: { text: string; url?: string }[] = [
  { text: 'Generado con ' },
  { text: PRODUCT.name, url: PRODUCT.url },
  { text: ' · desarrollado por ' },
  { text: NORTHAR.name, url: NORTHAR.url },
  { text: ' · ' },
  { text: NORTHAR.label, url: NORTHAR.url },
];

/**
 * Dibuja la firma centrada en `centerX`, con el borde superior del texto en
 * `y`. Devuelve la altura que ocupa.
 *
 * La línea se escribe tramo por tramo para poder poner un link en cada uno, y
 * cada tramo se ubica a mano con su ancho medido: con `align: 'center'` cada
 * `text()` se centraría por separado y los tramos quedarían encimados.
 */
export function drawNorthArCredit(
  doc: PDFKit.PDFDocument,
  centerX: number,
  y: number,
): number {
  doc.save();
  doc.font(CREDIT_FONT).fontSize(CREDIT_FONT_SIZE).fillColor(CREDIT_COLOR);

  const widths = SEGMENTS.map((s) => doc.widthOfString(s.text));
  const height = doc.currentLineHeight();
  let x = centerX - widths.reduce((a, w) => a + w, 0) / 2;

  SEGMENTS.forEach((s, i) => {
    doc.text(s.text, x, y, { lineBreak: false });
    if (s.url) doc.link(x, y, widths[i], height, s.url);
    x += widths[i];
  });

  doc.restore();
  return height;
}
