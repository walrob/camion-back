/**
 * Catálogo de ajustes configurables por empresa.
 *
 * Es la **única** fuente: el default, el tipo, la validación y el texto que se
 * muestra en la pantalla salen todos de acá. Agregar un ajuste es agregar una
 * entrada en este archivo y consumirlo donde corresponda; la pantalla de
 * configuración del front se dibuja sola a partir de `GET /settings`.
 *
 * REGLA DE DEFAULTS: el valor por defecto es **lo que el sistema hace hoy**, no
 * lo que nos parece mejor. Una versión nueva no puede cambiarle el
 * comportamiento a una empresa que no tocó nada. Si el default recomendado es
 * otro, se dice en `help` y lo decide el cliente.
 *
 * Ver docs/CONFIGURACION.md (front-camion) para el diseño completo.
 */

export type SettingType = 'boolean' | 'number' | 'string' | 'enum';

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingDef {
  key: string;
  group: string;
  type: SettingType;
  /** Siempre string: es como se guarda y como viaja. */
  default: string;
  label: string;
  help: string;
  options?: SettingOption[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface SettingGroup {
  key: string;
  label: string;
  help: string;
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    key: 'locale',
    label: 'Moneda y formato',
    help: 'En qué moneda mira sus números la empresa y cómo se escriben.',
  },
  {
    key: 'trip',
    label: 'Viajes',
    help: 'Qué exige el sistema antes de que un camión salga a la ruta.',
  },
  {
    key: 'settlement',
    label: 'Rendiciones',
    help: 'Cómo se cierra la plata de cada viaje.',
  },
  {
    key: 'fuel',
    label: 'Combustible',
    help: 'Qué datos son obligatorios al cargar un abastecimiento.',
  },
];

export const SETTING_DEFS: SettingDef[] = [
  // ───────── Moneda ─────────
  {
    key: 'locale.baseCurrency',
    group: 'locale',
    type: 'enum',
    default: 'ARS',
    label: 'Moneda base',
    help: 'La moneda de los reportes, los indicadores y el neto de cada rendición. Los gastos se pueden cargar en otra y se convierten a ésta con la cotización del día (docs/CONFIGURACION.md §7).',
    options: [
      { value: 'ARS', label: 'Peso argentino (ARS)' },
      { value: 'USD', label: 'Dólar (USD)' },
      { value: 'BRL', label: 'Real (BRL)' },
      { value: 'PYG', label: 'Guaraní (PYG)' },
      { value: 'CLP', label: 'Peso chileno (CLP)' },
      { value: 'UYU', label: 'Peso uruguayo (UYU)' },
      { value: 'BOB', label: 'Boliviano (BOB)' },
      { value: 'EUR', label: 'Euro (EUR)' },
    ],
  },

  {
    key: 'locale.locale',
    group: 'locale',
    type: 'enum',
    default: 'es-AR',
    label: 'Formato de números y fechas',
    help: 'Cómo se escriben los importes y las fechas en pantalla. Sólo cambia la presentación: los datos son los mismos.',
    options: [
      { value: 'es-AR', label: 'Argentina (1.234,56 · 20/05/2026)' },
      { value: 'es-CL', label: 'Chile' },
      { value: 'es-PY', label: 'Paraguay' },
      { value: 'es-UY', label: 'Uruguay' },
      { value: 'es-BO', label: 'Bolivia' },
      { value: 'pt-BR', label: 'Brasil (1.234,56 · 20/05/2026)' },
    ],
  },

  // ───────── Viajes ─────────
  {
    key: 'trip.requireChecklistToStart',
    group: 'trip',
    type: 'boolean',
    default: 'true',
    label: 'Exigir checklist para iniciar el viaje',
    help: 'El chofer no puede iniciar hasta completar y firmar el checklist pre-viaje. Si tu operación no usa checklist, desactivalo.',
  },
  {
    key: 'trip.requireOeaToStart',
    group: 'trip',
    type: 'boolean',
    default: 'false',
    label: 'Exigir planilla OEA conforme para iniciar',
    help: 'Para operaciones bajo Operador Económico Autorizado: sin la planilla del viaje en estado conforme, no se puede iniciar.',
  },
  {
    key: 'trip.blockOnExpiredDocs',
    group: 'trip',
    type: 'boolean',
    default: 'false',
    label: 'Bloquear la asignación si hay documentación vencida',
    help: 'Impide asignar un viaje cuando el camión, el acoplado o el chofer tienen algún documento vencido. Con esto apagado, el sistema igual avisa.',
  },
  {
    key: 'trip.codePrefix',
    group: 'trip',
    type: 'string',
    default: 'V-',
    label: 'Prefijo del número de viaje',
    help: 'Con qué empieza el código visible de cada viaje (por ejemplo, "V-" genera V-00001). Sólo afecta a los viajes nuevos.',
    maxLength: 8,
  },

  // ───────── Rendiciones ─────────
  {
    key: 'settlement.perDiemMode',
    group: 'settlement',
    type: 'enum',
    default: 'log',
    label: 'Cómo se paga el viático',
    help: 'Si lo carga el chofer en la bitácora (como hasta ahora), si es un monto fijo que se define al asignar el viaje, o las dos cosas.',
    options: [
      { value: 'log', label: 'Lo carga el chofer en la bitácora' },
      { value: 'fixed', label: 'Monto fijo por viaje' },
      { value: 'both', label: 'Las dos cosas' },
    ],
  },
  {
    key: 'settlement.requireFxOnClose',
    group: 'settlement',
    type: 'boolean',
    default: 'true',
    label: 'Exigir la conversión antes de cerrar',
    help: 'No deja cerrar una rendición que tenga movimientos en otra moneda sin cotización cargada. Apagado, esos movimientos quedan fuera del total.',
  },
  {
    key: 'settlement.allowReopen',
    group: 'settlement',
    type: 'boolean',
    default: 'true',
    label: 'Permitir reabrir una rendición cerrada',
    help: 'Con esto apagado, una rendición cerrada es definitiva para todos, incluido el administrador. La reapertura siempre exige motivo y queda auditada.',
  },

  // ───────── Combustible ─────────
  {
    key: 'fuel.requireOdometer',
    group: 'fuel',
    type: 'boolean',
    default: 'false',
    label: 'Exigir odómetro en cada carga',
    help: 'Recomendado: sin el kilometraje de cada carga no se puede calcular el rendimiento (km/l) ni el costo por kilómetro.',
  },
];

export const SETTING_BY_KEY: Map<string, SettingDef> = new Map(
  SETTING_DEFS.map((d) => [d.key, d]),
);

/** Claves conocidas, para que quien consume un ajuste no escriba el string. */
export const SETTING = {
  TRIP_REQUIRE_CHECKLIST: 'trip.requireChecklistToStart',
  TRIP_REQUIRE_OEA: 'trip.requireOeaToStart',
  TRIP_BLOCK_ON_EXPIRED_DOCS: 'trip.blockOnExpiredDocs',
  TRIP_CODE_PREFIX: 'trip.codePrefix',
  SETTLEMENT_ALLOW_REOPEN: 'settlement.allowReopen',
  SETTLEMENT_REQUIRE_FX: 'settlement.requireFxOnClose',
  SETTLEMENT_PER_DIEM_MODE: 'settlement.perDiemMode',
  BASE_CURRENCY: 'locale.baseCurrency',
  LOCALE: 'locale.locale',
  FUEL_REQUIRE_ODOMETER: 'fuel.requireOdometer',
} as const;
