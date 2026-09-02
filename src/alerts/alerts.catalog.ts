/**
 * Catálogo de reglas del motor de alertas (fase E de docs/CONFIGURACION.md §6.3).
 *
 * `AlertRuleConfig` ya guardaba `key`/`value`/`enabled` por empresa, y el límite
 * del plan —3 reglas en Control, 10 en Operación, ilimitadas en Gestión— ya se
 * cuenta sobre esa tabla. Lo que faltaba era **el catálogo de reglas que el
 * motor conoce**: sin él no había pantalla posible ni forma de saber qué se
 * puede apagar.
 *
 * Por eso las reglas NO se absorbieron en `CompanySetting` como preveía el plan:
 * una regla no es un ajuste suelto, es una unidad que se cuenta contra el cupo
 * del plan. Fusionarlas habría roto un límite que ya está vendido y enforced.
 *
 * REGLA DE DEFAULTS, otra vez: toda regla viene **activa** con el valor que el
 * sistema usaba. Una empresa que no entra a esta pantalla recibe exactamente las
 * mismas alertas que antes.
 */

export interface AlertRuleDef {
  key: string;
  label: string;
  help: string;
  /** Nivel con el que el motor emite esta alerta, para mostrarlo en pantalla. */
  level: 'red' | 'orange' | 'yellow' | 'green';
  /**
   * Umbral configurable. Las reglas sin umbral sólo se prenden y se apagan.
   */
  threshold?: {
    default: string;
    label: string;
    unit: string;
    min: number;
    max: number;
  };
  /**
   * Reglas que **no se apagan**: son el corazón del producto. Silenciar el aviso
   * de un accidente no es una preferencia, es perder el motivo por el que el
   * chofer tiene la app. Tampoco consumen cupo del plan.
   */
  siempreActiva?: boolean;
}

export const ALERT_RULE = {
  INCIDENT: 'incident.reported',
  EMPLOYMENT: 'employment.leaveAssignment',
  EXPENSE: 'expense.overThreshold',
  TRUCK_IDLE: 'truck.idle',
  DOCUMENT_EXPIRY: 'document.expiring',
  CERTIFICATION_EXPIRY: 'certification.expiring',
  MAINTENANCE_KM: 'maintenance.kmAhead',
  MAINTENANCE_DAYS: 'maintenance.daysAhead',
} as const;

export const ALERT_RULES: AlertRuleDef[] = [
  {
    key: ALERT_RULE.INCIDENT,
    label: 'Incidente reportado por un chofer',
    help: 'Cada incidente que llega desde la app genera su alerta, con el nivel que corresponde a su severidad.',
    level: 'red',
    siempreActiva: true,
  },
  {
    key: ALERT_RULE.EMPLOYMENT,
    label: 'Viaje asignado a alguien de licencia',
    help: 'Avisa a RRHH cuando se cerró una licencia para poder asignar un viaje.',
    level: 'orange',
    siempreActiva: true,
  },
  {
    key: ALERT_RULE.EXPENSE,
    label: 'Gasto fuera de lo esperado',
    help: 'Avisa cuando un gasto de la bitácora supera el monto que definas. Se compara en tu moneda base.',
    level: 'yellow',
    threshold: {
      default: '100000',
      label: 'Monto a partir del cual avisar',
      unit: 'monto',
      min: 1,
      max: 100_000_000,
    },
  },
  {
    key: ALERT_RULE.TRUCK_IDLE,
    label: 'Camión detenido demasiado tiempo',
    help: 'Un camión en viaje que no registra movimiento ni gastos durante estas horas.',
    level: 'orange',
    threshold: {
      default: '6',
      label: 'Horas sin novedades',
      unit: 'horas',
      min: 1,
      max: 168,
    },
  },
  {
    key: ALERT_RULE.DOCUMENT_EXPIRY,
    label: 'Documento por vencer',
    help: 'Con cuánta anticipación avisar que se vence el seguro, la VTV o cualquier documento. También es lo que marca un documento como «Por vencer» en el Centro Documental.',
    level: 'green',
    threshold: {
      default: '30',
      label: 'Días de anticipación',
      unit: 'días',
      min: 1,
      max: 365,
    },
  },
  {
    key: ALERT_RULE.CERTIFICATION_EXPIRY,
    label: 'Permiso o habilitación por vencer',
    help: 'Ídem para el carnet, el psicofísico y los permisos del legajo.',
    level: 'green',
    threshold: {
      default: '30',
      label: 'Días de anticipación',
      unit: 'días',
      min: 1,
      max: 365,
    },
  },
  {
    key: ALERT_RULE.MAINTENANCE_KM,
    label: 'Mantenimiento próximo (por kilómetros)',
    help: 'Cuántos kilómetros antes del service programado empezar a avisar.',
    level: 'green',
    threshold: {
      default: '1000',
      label: 'Kilómetros de anticipación',
      unit: 'km',
      min: 50,
      max: 50_000,
    },
  },
  {
    key: ALERT_RULE.MAINTENANCE_DAYS,
    label: 'Mantenimiento próximo (por fecha)',
    help: 'Cuántos días antes del service programado empezar a avisar.',
    level: 'green',
    threshold: {
      default: '15',
      label: 'Días de anticipación',
      unit: 'días',
      min: 1,
      max: 365,
    },
  },
];

export const ALERT_RULE_BY_KEY: Map<string, AlertRuleDef> = new Map(
  ALERT_RULES.map((r) => [r.key, r]),
);

/**
 * Claves con las que se guardaban los umbrales antes de tener catálogo. La
 * migración las renombra; el mapa queda para que un valor viejo que sobreviva
 * en alguna base no se pierda en silencio.
 */
export const CLAVES_ANTERIORES: Record<string, string> = {
  expenseAmountThreshold: ALERT_RULE.EXPENSE,
  idleHoursThreshold: ALERT_RULE.TRUCK_IDLE,
  expiryWarningDays: ALERT_RULE.DOCUMENT_EXPIRY,
  maintenanceKmThreshold: ALERT_RULE.MAINTENANCE_KM,
  maintenanceDaysThreshold: ALERT_RULE.MAINTENANCE_DAYS,
};
