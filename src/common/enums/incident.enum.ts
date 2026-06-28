export enum IncidentType {
  MECHANICAL = 'mechanical',
  ACCIDENT = 'accident',
  CASH_SHORTAGE = 'cash_shortage',
  DELAY = 'delay',
  CARGO_ISSUE = 'cargo_issue',
  CLIENT_ISSUE = 'client_issue',
  EMERGENCY = 'emergency',
}

export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}
