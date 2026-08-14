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

/**
 * Cómo se nombra cada rol de cara al usuario.
 *
 * Vive acá porque el mail de invitación se arma en el backend y tiene que decir
 * "Despachante", no `dispatcher`. Los textos son los mismos que muestra el
 * front en la pantalla de aceptación.
 */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPERADMIN]: 'Superadministrador',
  [Role.ADMIN]: 'Administrador',
  [Role.MANAGER]: 'Gerencia',
  [Role.DISPATCHER]: 'Despachante',
  [Role.MAINTENANCE]: 'Taller',
  [Role.DRIVER]: 'Chofer',
  [Role.HR]: 'Recursos Humanos',
  [Role.AUDITOR]: 'Auditoría',
};
