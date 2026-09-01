/**
 * Catálogos de negocio configurables por empresa.
 *
 * Acá viven los **elementos de sistema**: los que trae el producto y el código
 * conoce por su clave. Una empresa puede renombrarlos, recolorearlos,
 * reordenarlos y desactivarlos, pero no eliminarlos ni cambiarles el
 * comportamiento (docs/CONFIGURACION.md §5).
 *
 * Los que agrega el cliente nacen sin comportamiento especial: en gastos, suman
 * como gasto, que es el default seguro.
 *
 * Para sumar un catálogo nuevo: agregar la definición acá, liberar la columna
 * correspondiente del `enum` de MySQL con una migración, y hacer que el front
 * lo lea del store en vez de su constante.
 */

export interface CatalogItemDef {
  key: string;
  label: string;
  color?: string;
  icon?: string;
  /** Sólo en los catálogos con comportamiento (hoy, gastos). */
  behavior?: string;
}

export interface CatalogDef {
  key: string;
  label: string;
  help: string;
  /** Si sus elementos declaran comportamiento (`expense` / `advance`). */
  usaComportamiento?: boolean;
  items: CatalogItemDef[];
}

/** Comportamientos que el código entiende en el catálogo de gastos. */
export const BEHAVIOR = {
  /** Suma en la rendición. Es el default de todo lo que no diga otra cosa. */
  EXPENSE: 'expense',
  /** Resta en la rendición: plata que la empresa ya le dio al chofer. */
  ADVANCE: 'advance',
} as const;

export const CATALOG = {
  EXPENSE_TYPE: 'expense_type',
  INCIDENT_TYPE: 'incident_type',
} as const;

export const CATALOG_DEFS: CatalogDef[] = [
  {
    key: CATALOG.EXPENSE_TYPE,
    label: 'Tipos de gasto',
    help: 'Lo que el chofer puede cargar en la bitácora del viaje. Los marcados como adelanto restan en la rendición; el resto suma.',
    usaComportamiento: true,
    items: [
      { key: 'fuel', label: 'Combustible', color: 'primary', icon: 'mdi-gas-station' },
      { key: 'toll', label: 'Peaje', color: 'info', icon: 'mdi-boom-gate' },
      { key: 'expense', label: 'Gasto', color: 'secondary', icon: 'mdi-cash' },
      {
        key: 'cash_advance',
        label: 'Adelanto',
        color: 'warning',
        icon: 'mdi-cash-minus',
        behavior: BEHAVIOR.ADVANCE,
      },
      { key: 'repair', label: 'Reparación', color: 'error', icon: 'mdi-wrench' },
      { key: 'fine', label: 'Multa', color: 'error', icon: 'mdi-alert-octagon' },
      { key: 'per_diem', label: 'Viático', color: 'success', icon: 'mdi-food' },
      { key: 'other', label: 'Otro', color: 'grey', icon: 'mdi-dots-horizontal' },
    ],
  },
  {
    key: CATALOG.INCIDENT_TYPE,
    label: 'Tipos de incidente',
    help: 'Lo que el chofer puede reportar desde la app cuando algo pasa en la ruta.',
    items: [
      { key: 'mechanical', label: 'Rotura mecánica', color: 'warning', icon: 'mdi-wrench' },
      { key: 'accident', label: 'Accidente', color: 'error', icon: 'mdi-car-emergency' },
      { key: 'cash_shortage', label: 'Falta de dinero', color: 'info', icon: 'mdi-cash-remove' },
      { key: 'delay', label: 'Retraso', color: 'secondary', icon: 'mdi-clock-alert' },
      {
        key: 'cargo_issue',
        label: 'Problema con carga',
        color: 'warning',
        icon: 'mdi-package-variant-closed-remove',
      },
      {
        key: 'client_issue',
        label: 'Problema con cliente',
        color: 'info',
        icon: 'mdi-account-alert',
      },
      { key: 'emergency', label: 'Emergencia', color: 'error', icon: 'mdi-alarm-light' },
    ],
  },
];

export const CATALOG_BY_KEY: Map<string, CatalogDef> = new Map(
  CATALOG_DEFS.map((c) => [c.key, c]),
);

/** ¿Esta clave es un elemento de sistema de ese catálogo? */
export const esDeSistema = (catalog: string, key: string): boolean =>
  !!CATALOG_BY_KEY.get(catalog)?.items.some((i) => i.key === key);
