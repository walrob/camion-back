/** Estado comercial de una empresa (tenant). */
export enum CompanyStatus {
  /** Prueba gratuita en curso. Acceso completo. */
  TRIAL = 'trial',
  /** Suscripción al día. Acceso completo. */
  ACTIVE = 'active',
  /** Con deuda vencida pero dentro de los días de gracia. Acceso completo con aviso. */
  DEFAULTER = 'defaulter',
  /** Vencido el período de gracia. Solo lectura sobre una lista blanca de rutas. */
  BLOCKED = 'blocked',
  /** Baja definitiva. Sin acceso. */
  CANCELLED = 'cancelled',
}
