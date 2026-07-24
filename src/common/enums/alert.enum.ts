export enum AlertLevel {
  RED = 'red',
  ORANGE = 'orange',
  YELLOW = 'yellow',
  GREEN = 'green',
}

export enum AlertStatus {
  NEW = 'new',
  SEEN = 'seen',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

export enum AlertSourceType {
  INCIDENT = 'incident',
  EXPENSE = 'expense',
  DOCUMENT = 'document',
  CERTIFICATION = 'certification',
  TRUCK_IDLE = 'truck_idle',
  MAINTENANCE = 'maintenance',
  /** Situación del legajo: licencia, suspensión o baja del empleado. */
  EMPLOYMENT = 'employment',
}
