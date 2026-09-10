/**
 * Condición frente al IVA de quien recibe la factura.
 *
 * Define qué comprobante corresponde emitir: a un responsable inscripto va una
 * factura A y a los demás una B. No se guarda como enum de base a propósito
 * —la columna es `varchar`— porque la AFIP cambia las categorías cada tanto y
 * un `ALTER TABLE ... MODIFY enum` sobre una tabla de facturación es un riesgo
 * innecesario frente a validarlo en el DTO.
 */
export enum TaxCondition {
  RESPONSABLE_INSCRIPTO = 'responsable_inscripto',
  MONOTRIBUTO = 'monotributo',
  EXENTO = 'exento',
  CONSUMIDOR_FINAL = 'consumidor_final',
  NO_ALCANZADO = 'no_alcanzado',
}

/** Etiquetas para la pantalla, el PDF y las exportaciones. */
export const TAX_CONDITION_LABELS: Record<TaxCondition, string> = {
  [TaxCondition.RESPONSABLE_INSCRIPTO]: 'Responsable inscripto',
  [TaxCondition.MONOTRIBUTO]: 'Monotributo',
  [TaxCondition.EXENTO]: 'Exento',
  [TaxCondition.CONSUMIDOR_FINAL]: 'Consumidor final',
  [TaxCondition.NO_ALCANZADO]: 'No alcanzado',
};
