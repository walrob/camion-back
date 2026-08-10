/**
 * Situación de una unidad a los efectos de la facturación (MODELO-COMERCIAL §2.3).
 *
 * Es independiente del estado operativo (`TruckStatus`): un camión puede estar
 * en taller —operativamente no disponible— y seguir facturando al 100 %, porque
 * sigue siendo parte de la flota administrada.
 */
export enum BillingStatus {
  /** Factura al 100 %. */
  ACTIVE = 'active',
  /**
   * Fuera de servicio declarado por más de 30 días corridos. Factura al 30 %,
   * conserva historial, documentos y órdenes de trabajo, pero **no admite
   * asignación de viajes**.
   */
  INACTIVE = 'inactive',
  /** Baja definitiva: no factura. Se conserva por el histórico. */
  DECOMMISSIONED = 'decommissioned',
}

/** Estado del período facturable. */
export enum SubscriptionStatus {
  /** Emitido, pendiente de cobro. */
  ISSUED = 'issued',
  /** Cobrado. */
  PAID = 'paid',
  /** Vencido sin pago. */
  OVERDUE = 'overdue',
  /** Anulado (error de emisión). Nunca se borra un período emitido. */
  VOID = 'void',
}

export enum PaymentMethod {
  TRANSFER = 'transfer',
  CASH = 'cash',
  CHECK = 'check',
  MERCADOPAGO = 'mercadopago',
  OTHER = 'other',
}

/** Tipo de cambio registrado en el histórico comercial de una empresa. */
export enum PlanUpdateType {
  PLAN_UPGRADE = 'plan_upgrade',
  PLAN_DOWNGRADE = 'plan_downgrade',
  ADDON_ADDED = 'addon_added',
  ADDON_REMOVED = 'addon_removed',
  PREPAY_CHANGED = 'prepay_changed',
}

/**
 * Estado de un cambio comercial.
 *
 * `PENDING` es lo que permite la fricción asimétrica del §6.4: los upgrades se
 * aplican en el acto, las bajas esperan a la renovación.
 */
export enum PlanUpdateStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  CANCELLED = 'cancelled',
}
