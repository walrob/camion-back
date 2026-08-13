import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de empresa (tenant) por request.
 *
 * Permite que repositorios y subscribers sepan de qué empresa es la operación en
 * curso sin que haya que pasar `companyId` como parámetro en cada llamada. Ese
 * "pasarlo a mano" es justamente lo que hace que el aislamiento dependa de que
 * nadie se olvide, que es lo que este diseño evita.
 *
 * Cómo se puebla:
 *
 *  1. `TenantContextMiddleware` abre un store vacío que envuelve todo el manejo
 *     del request (guards, interceptors y handler).
 *  2. `AuthGuard`, una vez que verificó el token, completa ese store con
 *     `setTenantContext()`.
 *
 * El store se crea vacío y se completa después porque en el middleware todavía
 * no se validó el JWT: `request.user` lo escribe el guard, que corre más tarde.
 * Como el store es un objeto mutable guardado en el AsyncLocalStorage, llenarlo
 * a posteriori alcanza y evita tener que recurrir a `enterWith()`.
 */

export interface TenantStore {
  /** Empresa del usuario autenticado. `undefined` antes del login. */
  companyId?: string;
  /** Usuario autenticado, para auditoría. */
  userId?: string;
  /**
   * Operación de sistema (cron, webhook, superadmin): salta el filtrado por
   * empresa y el tripwire. Es la ÚNICA vía de escape y siempre es explícita.
   */
  system?: boolean;
  /**
   * Fecha de corte de la retención del plan: no se muestran registros
   * históricos anteriores. `undefined` = sin corte (plan ilimitado).
   *
   * Viaja en el contexto porque el query builder se arma de forma sincrónica y
   * no puede esperar una consulta del plan en el momento de filtrar.
   *
   * El dato **no se borra** (decisión D4): sólo se deja de mostrar. Un upgrade
   * devuelve el histórico completo al instante, que es justamente el argumento
   * de venta.
   */
  retentionCutoff?: Date;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Abre un store vacío para el request en curso. */
export const runWithTenantContext = <T>(fn: () => T): T =>
  tenantStorage.run({}, fn);

/** Completa el store del request una vez validado el token. */
export function setTenantContext(companyId: string, userId?: string): void {
  const store = tenantStorage.getStore();
  if (!store) return; // fuera de un request (tests unitarios, arranque)
  store.companyId = companyId;
  store.userId = userId;
}

/**
 * Marca el request como operación de plataforma: ve todas las empresas.
 *
 * Lo usa **sólo** el superadmin, y se declara de forma explícita en vez de
 * apoyarse en que "sin empresa no se filtra". La diferencia importa: un token
 * roto o un guard mal puesto también dejarían el contexto vacío, y eso no puede
 * confundirse con un permiso. Acá el privilegio se pide por su nombre.
 */
export function setSystemContext(userId?: string): void {
  const store = tenantStorage.getStore();
  if (!store) return;
  store.system = true;
  store.userId = userId;
}

/** Fija el corte de retención del plan para el request en curso. */
export function setRetentionCutoff(cutoff?: Date): void {
  const store = tenantStorage.getStore();
  if (!store) return;
  store.retentionCutoff = cutoff;
}

/** Corte de retención vigente, o `undefined` si el plan no recorta. */
export const getRetentionCutoff = (): Date | undefined =>
  tenantStorage.getStore()?.retentionCutoff;

/**
 * Calcula el corte a partir de los meses de retención del plan.
 * `null`/`undefined` = plan sin límite.
 */
export function calcularCorteRetencion(
  retentionMonths?: number | null,
): Date | undefined {
  if (!retentionMonths) return undefined;
  const corte = new Date();
  corte.setMonth(corte.getMonth() - retentionMonths);
  corte.setHours(0, 0, 0, 0);
  return corte;
}

/** Empresa de la operación en curso, si la hay. */
export const getCurrentCompanyId = (): string | undefined =>
  tenantStorage.getStore()?.companyId;

export const getCurrentUserId = (): string | undefined =>
  tenantStorage.getStore()?.userId;

/** true si la operación en curso es de sistema y no debe filtrarse. */
export const isSystemContext = (): boolean =>
  tenantStorage.getStore()?.system === true;

/**
 * Ejecuta `fn` en nombre de una empresa concreta. Para crons, webhooks y
 * cualquier trabajo sin request que sí opera sobre una empresa.
 *
 *   await runAsCompany(company.id, () => this.alerts.evaluarVencimientos());
 */
export const runAsCompany = <T>(companyId: string, fn: () => T): T =>
  tenantStorage.run({ companyId }, fn);

/**
 * Ejecuta `fn` SIN filtrado por empresa: ve los datos de todas.
 *
 * Es la vía de escape para el superadmin, los reportes globales y los crons que
 * recorren todas las empresas. Usarla es una decisión explícita y auditable: si
 * aparece en un servicio de dominio, es un error.
 */
export const runAsSystem = <T>(fn: () => T): T =>
  tenantStorage.run({ system: true }, fn);
