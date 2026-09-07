export enum ChecklistResult {
  PENDING = 'pending',
  /**
   * Firmado por el chofer, pero la unidad **no** está liberada: falta que
   * Tráfico valide lo que el chofer declaró.
   *
   * Es el estado que faltaba. Antes, firmar resolvía sola la pregunta «¿sale o
   * no sale?», y una planilla que declara una irregularidad no la puede
   * responder sola: la responde una persona.
   */
  PENDING_VALIDATION = 'pending_validation',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ChecklistItemStatus {
  OK = 'ok',
  FAIL = 'fail',
  NA = 'na',
}

/**
 * Lo que el chofer efectivamente contestó, antes de interpretarlo.
 *
 * `status` dice si el punto está conforme; `answer` dice qué apretó. Son dos
 * cosas distintas cuando la pregunta está en negativo —«¿tiene pérdidas de
 * aceite?»—, donde el SÍ es la respuesta mala. Guardar sólo el `status` perdía
 * el dato original y dejaba la interpretación en manos del front.
 */
export enum ChecklistAnswer {
  YES = 'yes',
  NO = 'no',
  NA = 'na',
}

/**
 * Qué clase de punto es. No todo lo que hay en una planilla es una inspección:
 * hay declaraciones que el chofer tiene que aceptar, fotos que hay que adjuntar
 * siempre y campos de texto libre.
 */
export enum ChecklistItemType {
  /** Pregunta de estado: se responde y se evalúa contra `expectedAnswer`. */
  CONDITION = 'condition',
  /**
   * Declaración de lectura y conformidad. No evalúa el estado de la unidad:
   * o se acepta, o no se puede firmar.
   */
  ACK = 'ack',
  /** Sólo adjuntos: «adjunte fotos del interior del furgón». */
  PHOTO = 'photo',
  /** Texto libre: «desarrolle cualquier otro punto que considere importante». */
  TEXT = 'text',
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

/**
 * Traduce lo que contestó el chofer a si el punto está conforme, según cuál sea
 * la respuesta buena para ese ítem.
 *
 * Vive acá y no en el front porque es la regla que decide si un camión sale:
 * el cliente manda la respuesta, el servidor decide qué significa.
 */
export function statusDesdeRespuesta(
  answer: ChecklistAnswer,
  expected: ChecklistAnswer,
): ChecklistItemStatus {
  if (answer === ChecklistAnswer.NA) return ChecklistItemStatus.NA;
  return answer === expected
    ? ChecklistItemStatus.OK
    : ChecklistItemStatus.FAIL;
}
