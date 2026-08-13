export enum Role {
  /**
   * Operador de la plataforma, no de una empresa.
   *
   * Es el ÚNICO rol sin `companyId` y el único con acceso entre empresas. Ese
   * privilegio es también el mayor riesgo del sistema, así que su acceso es
   * explícito (se marca el contexto como de sistema) y queda auditado.
   */
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  DISPATCHER = 'dispatcher',
  MAINTENANCE = 'maintenance',
  DRIVER = 'driver',
  HR = 'hr',
  AUDITOR = 'auditor',
}
