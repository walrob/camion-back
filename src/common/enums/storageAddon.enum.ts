/**
 * Add-on de almacenamiento adicional.
 *
 * Son dos escalones fijos, no una cantidad libre de GB. El motivo es comercial y
 * operativo: un tope cerrado se cotiza de memoria, se factura sin prorrateos
 * raros y no obliga a discutir cuántos GB necesita el cliente.
 *
 * Existe para que quedarse sin espacio **no obligue a subir de plan**: el costo
 * de S3 es proporcional a los GB, así que se cubre con un cargo proporcional y
 * no vendiéndole funcionalidad que el cliente no pidió.
 */
export enum StorageAddon {
  /** Sin add-on: rige el almacenamiento incluido en el plan. */
  NONE = 'none',
  /** Lleva la capacidad total a 10 GB. */
  GB10 = 'gb10',
  /** Lleva la capacidad total a 50 GB. */
  GB50 = 'gb50',
}

/**
 * Techo de capacidad de cada escalón, en GB.
 *
 * Es un TECHO, no un incremento: el tope efectivo de la empresa es el mayor
 * entre lo que incluye el plan y este valor. Así, contratar el escalón de 10 GB
 * en un plan que ya trae 50 no baja nada.
 */
export const TECHO_STORAGE_ADDON: Record<StorageAddon, number | null> = {
  [StorageAddon.NONE]: null,
  [StorageAddon.GB10]: 10,
  [StorageAddon.GB50]: 50,
};
