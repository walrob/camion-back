export enum OeaResult {
  PENDING = 'pending',
  CONFORME = 'conforme',
  NO_CONFORME = 'no_conforme',
}

export enum OeaSection {
  // 7 puntos de inspección física del vehículo/zona de carga.
  PHYSICAL = 'physical',
  // Dispositivos de seguridad (precintos, cierres, lonas).
  SECURITY_DEVICES = 'security_devices',
}

export enum OeaItemStatus {
  OK = 'ok',
  OBSERVED = 'observed',
  NA = 'na',
}

export enum OeaItemKey {
  // ─── Inspección física (7 puntos AFIP) ───
  FRONT_WALL = 'front_wall',
  SIDE_WALLS = 'side_walls',
  FLOOR = 'floor',
  CEILING = 'ceiling',
  DOORS = 'doors',
  FRONT_EXTERIOR = 'front_exterior',
  CHASSIS = 'chassis',
  // ─── Dispositivos de seguridad ───
  CUSTOMS_SEAL = 'customs_seal',
  SECURITY_SEAL = 'security_seal',
  LOCKS = 'locks',
  TARPS = 'tarps',
}

// Plantilla por defecto de la planilla de control OEA.
export const DEFAULT_OEA_ITEMS: {
  key: OeaItemKey;
  label: string;
  section: OeaSection;
}[] = [
  {
    key: OeaItemKey.FRONT_WALL,
    label: 'Pared frontal (exterior e interior)',
    section: OeaSection.PHYSICAL,
  },
  {
    key: OeaItemKey.SIDE_WALLS,
    label: 'Paredes laterales (izquierda y derecha)',
    section: OeaSection.PHYSICAL,
  },
  {
    key: OeaItemKey.FLOOR,
    label: 'Piso (interior y exterior)',
    section: OeaSection.PHYSICAL,
  },
  {
    key: OeaItemKey.CEILING,
    label: 'Techo / pared superior',
    section: OeaSection.PHYSICAL,
  },
  {
    key: OeaItemKey.DOORS,
    label: 'Puertas / sistema de cierre y bisagras',
    section: OeaSection.PHYSICAL,
  },
  {
    key: OeaItemKey.FRONT_EXTERIOR,
    label: 'Parte delantera / motor / tanque de combustible',
    section: OeaSection.PHYSICAL,
  },
  {
    key: OeaItemKey.CHASSIS,
    label: 'Chasis / ejes y zona de ruedas',
    section: OeaSection.PHYSICAL,
  },
  {
    key: OeaItemKey.CUSTOMS_SEAL,
    label: 'Precinto aduanero (sin adulterar/cortar/clonar)',
    section: OeaSection.SECURITY_DEVICES,
  },
  {
    key: OeaItemKey.SECURITY_SEAL,
    label: 'Precinto de seguridad',
    section: OeaSection.SECURITY_DEVICES,
  },
  {
    key: OeaItemKey.LOCKS,
    label: 'Cierres de seguridad (bulones, candados, cerrojos)',
    section: OeaSection.SECURITY_DEVICES,
  },
  {
    key: OeaItemKey.TARPS,
    label: 'Lonas / carpas (sin tajos, roturas ni parches)',
    section: OeaSection.SECURITY_DEVICES,
  },
];
