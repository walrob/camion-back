export enum ChecklistResult {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ChecklistItemStatus {
  OK = 'ok',
  FAIL = 'fail',
  NA = 'na',
}

export enum ChecklistItemKey {
  LIGHTS = 'lights',
  BRAKES = 'brakes',
  TIRES = 'tires',
  OIL = 'oil',
  FIRE_EXTINGUISHER = 'fire_extinguisher',
  DOCUMENTATION = 'documentation',
  TRAILER = 'trailer',
  OTHER = 'other',
}

// Plantilla por defecto de ítems del checklist pre-viaje.
export const DEFAULT_CHECKLIST_ITEMS: { key: ChecklistItemKey; label: string }[] = [
  { key: ChecklistItemKey.LIGHTS, label: 'Luces' },
  { key: ChecklistItemKey.BRAKES, label: 'Frenos' },
  { key: ChecklistItemKey.TIRES, label: 'Cubiertas' },
  { key: ChecklistItemKey.OIL, label: 'Aceite' },
  { key: ChecklistItemKey.FIRE_EXTINGUISHER, label: 'Matafuego' },
  { key: ChecklistItemKey.DOCUMENTATION, label: 'Documentación' },
  { key: ChecklistItemKey.TRAILER, label: 'Acoplado' },
];
