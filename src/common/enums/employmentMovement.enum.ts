import { EmploymentStatus } from './employmentStatus.enum';

/**
 * Movimientos del legajo laboral. El historial de movimientos es la fuente de
 * verdad: `Employee.employmentStatus` se recalcula a partir de él.
 *
 * Hay dos familias:
 *  - Puntuales (HIRE, REINSTATEMENT, TERMINATION): ocurren en una fecha y fijan
 *    el estado desde ahí en adelante. No llevan `endDate`.
 *  - Con período (LEAVE, SUSPENSION): van de `startDate` a `endDate`. Mientras
 *    están vigentes fijan el estado; al terminar, el empleado vuelve a ACTIVE.
 */
export enum EmploymentMovementType {
  /** Ingreso / alta inicial. */
  HIRE = 'hire',
  /** Licencia (ver `LeaveType` para el motivo). */
  LEAVE = 'leave',
  /** Suspensión disciplinaria. */
  SUSPENSION = 'suspension',
  /** Reincorporación: cierra una licencia/suspensión o reingresa a un dado de baja. */
  REINSTATEMENT = 'reinstatement',
  /** Baja / desvinculación. */
  TERMINATION = 'termination',
}

/** Motivo de la licencia. Solo aplica a movimientos de tipo LEAVE. */
export enum LeaveType {
  VACATION = 'vacation',
  SICK = 'sick',
  /** Accidente de trabajo (ART). */
  WORK_ACCIDENT = 'work_accident',
  /** Licencia por maternidad/paternidad. */
  PARENTAL = 'parental',
  /** Licencia sin goce de sueldo. */
  UNPAID = 'unpaid',
  STUDY = 'study',
  BEREAVEMENT = 'bereavement',
  OTHER = 'other',
}

/** Estado laboral que impone cada movimiento mientras está vigente. */
export const MOVEMENT_RESULTING_STATUS: Record<
  EmploymentMovementType,
  EmploymentStatus
> = {
  [EmploymentMovementType.HIRE]: EmploymentStatus.ACTIVE,
  [EmploymentMovementType.REINSTATEMENT]: EmploymentStatus.ACTIVE,
  [EmploymentMovementType.LEAVE]: EmploymentStatus.ON_LEAVE,
  [EmploymentMovementType.SUSPENSION]: EmploymentStatus.SUSPENDED,
  [EmploymentMovementType.TERMINATION]: EmploymentStatus.TERMINATED,
};

/** Tipos que abarcan un período y por lo tanto admiten `endDate`. */
export const PERIOD_MOVEMENT_TYPES: readonly EmploymentMovementType[] = [
  EmploymentMovementType.LEAVE,
  EmploymentMovementType.SUSPENSION,
];

export const isPeriodMovement = (type: EmploymentMovementType): boolean =>
  PERIOD_MOVEMENT_TYPES.includes(type);
