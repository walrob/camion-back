/**
 * Vocabulario del gating por plan.
 *
 * **Regla que no se negocia**: el código de negocio pregunta SIEMPRE por feature,
 * nunca por el código del plan. Nada de `if (plan.code === 'control')`. El mapa
 * feature → plan vive en la base (`Plan.features`) para que el superadmin lo
 * pueda cambiar sin un deploy, y para que agregar un plan nuevo no obligue a
 * tocar 20 controladores.
 *
 * Derivado de la matriz de `MODELO-COMERCIAL.md` §4.1.
 */
export enum Feature {
  // ── Base: en todos los planes ────────────────────────────────────────────
  /** Camiones, acoplados y agrupaciones de flota. */
  FLEET = 'fleet',
  /** Centro documental y alertas de vencimiento. */
  DOCUMENTS = 'documents',
  /** Bandeja de alertas automáticas. */
  ALERTS = 'alerts',
  /** Alta, asignación y seguimiento de viajes. */
  TRIPS = 'trips',
  /** Checklist pre-viaje con firma. */
  CHECKLISTS = 'checklists',
  /** Mensajería chofer ↔ base. */
  MESSAGES = 'messages',
  /** Reporte de incidentes desde la app del chofer. */
  INCIDENTS = 'incidents',
  /** App del chofer (PWA, offline). */
  DRIVER_APP = 'driver_app',

  // ── Operación ────────────────────────────────────────────────────────────
  /** Bitácora en ruta: gastos, adelantos, peajes, viáticos. */
  TRIP_LOG = 'trip_log',
  /**
   * Rendiciones automáticas. NUNCA en Control: es el módulo que sostiene la
   * conversión a Operación (MODELO-COMERCIAL §4.2).
   */
  SETTLEMENTS = 'settlements',
  /** Carga de combustible y tablero de consumos. */
  FUEL = 'fuel',
  /** Planes preventivos y órdenes de trabajo. */
  MAINTENANCE = 'maintenance',
  /** Planillas OEA (7 puntos AFIP). */
  OEA = 'oea',
  /** Tablero kanban de incidentes en vivo. */
  INCIDENTS_KANBAN = 'incidents_kanban',
  /** Legajo básico y habilitaciones con vencimiento. */
  HR_BASIC = 'hr_basic',
  /** Exportación a Excel de listados. */
  EXPORT_EXCEL = 'export_excel',

  // ── Gestión ──────────────────────────────────────────────────────────────
  /** Ranking y comparativa de consumo por camión y chofer. */
  FUEL_RANKING = 'fuel_ranking',
  /**
   * Indicadores gerenciales (costo por km). NUNCA en Operación: es el único
   * argumento que justifica el salto a Gestión (MODELO-COMERCIAL §4.2).
   */
  INDICATORS = 'indicators',
  /** Historial laboral, estados automáticos y bloqueo por licencia. */
  HR_FULL = 'hr_full',
  /** Umbrales de alerta personalizables. */
  ALERT_THRESHOLDS = 'alert_thresholds',
  /** Rol Auditor y trazabilidad de cambios. */
  AUDITOR_ROLE = 'auditor_role',
  /** Reportes programados por email. */
  SCHEDULED_REPORTS = 'scheduled_reports',

  // ── Corporate y add-ons ──────────────────────────────────────────────────
  /** API REST y webhooks. Add-on en Gestión, incluida en Corporate. */
  API = 'api',
  /** Multi-empresa y consolidación de grupo. */
  MULTI_COMPANY = 'multi_company',
  /** Inicio de sesión federado. */
  SSO = 'sso',
  /** Ambiente de prueba. */
  SANDBOX = 'sandbox',
  /** Marca blanca: logo, colores y dominio propio. */
  WHITE_LABEL = 'white_label',
}

/** Todas las features, para armar el plan LEGACY y el de Corporate. */
export const TODAS_LAS_FEATURES: Feature[] = Object.values(Feature);
