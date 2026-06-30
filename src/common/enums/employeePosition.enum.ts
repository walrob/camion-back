import { Role } from './role.enum';

export enum EmployeePosition {
  DRIVER = 'driver',
  MECHANIC = 'mechanic',
  DISPATCHER = 'dispatcher',
  MANAGER = 'manager',
  ADMIN = 'admin',
  OTHER = 'other',
}

/**
 * Cada puesto del legajo se corresponde con un Rol de acceso a la app. Se usa
 * para derivar el rol del User cuando el alta de un Employee crea su cuenta.
 * (Se puede sobreescribir pasando `role` explícito en el alta.)
 */
export const POSITION_ROLE: Record<EmployeePosition, Role> = {
  [EmployeePosition.DRIVER]: Role.DRIVER,
  [EmployeePosition.MECHANIC]: Role.MAINTENANCE,
  [EmployeePosition.DISPATCHER]: Role.DISPATCHER,
  [EmployeePosition.MANAGER]: Role.MANAGER,
  [EmployeePosition.ADMIN]: Role.ADMIN,
  [EmployeePosition.OTHER]: Role.DRIVER,
};
