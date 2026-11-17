import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Reglas de los emails de activación y re-enganche, sin dependencias de Nest
 * ni de la base para poder testearlas solas (`engagement.rules.spec.ts`).
 *
 * La acción que mide la activación de una empresa es cargar su primer viaje.
 */

export enum EngagementSegment {
  /** A. Se registró y no confirmó el email. */
  UNVERIFIED = 'unverified',
  /** B. Confirmó el email pero la empresa no tiene ningún viaje. */
  ACTIVATION = 'activation',
  /** C. Cargó su primer viaje: se lo invita a darle la app al chofer. */
  FIRST_TRIP = 'first_trip',
  /** D. Nadie de la empresa usa CamioNex hace días. */
  INACTIVE = 'inactive',
}

/** Orden de prioridad cuando a la misma persona le tocan varios. */
export const SEGMENT_PRIORITY: EngagementSegment[] = [
  EngagementSegment.UNVERIFIED,
  EngagementSegment.ACTIVATION,
  EngagementSegment.FIRST_TRIP,
  EngagementSegment.INACTIVE,
];

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Umbral de cada paso, contado desde el evento del segmento: el alta del
 * usuario (A), el alta de la empresa (B), el primer viaje (C) o el último uso
 * de cualquiera de la empresa (D).
 */
export const SEGMENT_STEPS: Record<EngagementSegment, number[]> = {
  [EngagementSegment.UNVERIFIED]: [1 * HOUR_MS, 24 * HOUR_MS, 3 * DAY_MS],
  [EngagementSegment.ACTIVATION]: [1 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS],
  [EngagementSegment.FIRST_TRIP]: [0],
  [EngagementSegment.INACTIVE]: [7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS],
};

/**
 * Cuánto después de su umbral un paso todavía se puede mandar. Pasado eso se
 * saltea: no se manda tarde.
 *
 * Cubre el fin de semana (el envío es sólo en días hábiles) y el tope de un
 * email cada 3 días. Y resuelve el primer deploy: quien está inactivo hace cien
 * días, o se registró hace dos meses, no recibe nada. Sólo entra quien está
 * cerca de un umbral.
 */
export const STEP_GRACE_MS: Record<EngagementSegment, number> = {
  [EngagementSegment.UNVERIFIED]: 4 * DAY_MS,
  [EngagementSegment.ACTIVATION]: 4 * DAY_MS,
  [EngagementSegment.FIRST_TRIP]: 7 * DAY_MS,
  [EngagementSegment.INACTIVE]: 4 * DAY_MS,
};

/** Tope entre dos emails a la misma persona (A no lo respeta ni lo consume). */
export const MIN_GAP_MS = 3 * DAY_MS;

/**
 * Segmentos que se mandan aunque la persona se haya dado de baja: confirmar el
 * email no es publicidad, es lo único que le permite entrar.
 */
export const IGNORES_OPT_OUT = new Set([EngagementSegment.UNVERIFIED]);
/** Segmentos que no esperan al tope de 3 días: los pasos de A están más juntos. */
export const IGNORES_GAP = new Set([EngagementSegment.UNVERIFIED]);

/**
 * Paso que corresponde mandar (1, 2 o 3), o null. Es el último cuyo umbral ya
 * pasó, siempre que siga dentro de su margen y no se haya mandado antes: si el
 * cron se atrasó y tocaban dos, va sólo el último, nunca dos juntos.
 */
export function dueStep(
  segment: EngagementSegment,
  elapsedMs: number,
  lastSentStep: number,
): number | null {
  const thresholds = SEGMENT_STEPS[segment];
  let latest = 0;
  thresholds.forEach((threshold, index) => {
    if (elapsedMs >= threshold) latest = index + 1;
  });
  if (!latest || latest <= lastSentStep) return null;

  const threshold = thresholds[latest - 1];
  if (elapsedMs >= threshold + STEP_GRACE_MS[segment]) return null;
  return latest;
}

const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * ¿Es horario laboral en Argentina? Lunes a viernes de 9 a 19 (el último envío
 * sale en la corrida de las 18). Los feriados no se contemplan.
 */
export function isBusinessHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AR_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return !['Sat', 'Sun'].includes(weekday ?? '') && hour >= 9 && hour < 19;
}

/** Agrega los UTM a un link del sitio. Los mailto quedan como están. */
export function withUtm(
  url: string,
  segment: EngagementSegment,
  step: number,
): string {
  if (!/^https?:\/\//.test(url)) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('utm_source', 'email');
  parsed.searchParams.set('utm_medium', 'email');
  parsed.searchParams.set('utm_campaign', `${segment}_${step}`);
  return parsed.toString();
}

/** El primer nombre, para el saludo y el asunto. */
export function firstName(name?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first ? first[0].toUpperCase() + first.slice(1) : '';
}

// -----------------------------------------------------------------------------
// Qué le falta a la empresa (elige el botón de B y C)
// -----------------------------------------------------------------------------

/** Lo que ya cargó la empresa. Sale de los datos reales, como los Primeros pasos. */
export interface CompanyProgress {
  trucks: number;
  drivers: number;
  /** Choferes con usuario: los que reciben los viajes en el celular. */
  driversWithApp: number;
  /** Documentos con fecha de vencimiento: lo que hace trabajar a las alertas. */
  expirations: number;
  trips: number;
}

/**
 * B: el primer paso que le falta para llegar al primer viaje. Sin camión ni
 * chofer no se puede cargar un viaje, así que el botón lleva a lo que falta y
 * no a un formulario que no va a poder completar.
 */
export type ActivationGap = 'truck' | 'driver' | 'trip';

export function activationGap(p: CompanyProgress): ActivationGap {
  if (!p.trucks) return 'truck';
  if (!p.drivers) return 'driver';
  return 'trip';
}

/**
 * C: lo que más valor suma después del primer viaje. null = ya tiene las dos
 * cosas y no hay nada que pedirle.
 */
export type FirstTripGap = 'driverApp' | 'expirations';

export function firstTripGap(p: CompanyProgress): FirstTripGap | null {
  if (!p.driversWithApp) return 'driverApp';
  if (!p.expirations) return 'expirations';
  return null;
}

// -----------------------------------------------------------------------------
// Token del link de baja
// -----------------------------------------------------------------------------

const tokenSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está definida.');
  // Clave derivada: este token no sirve para nada más que la baja.
  return `${secret}:emails-camionex`;
};

const signature = (userId: string): string =>
  createHmac('sha256', tokenSecret())
    .update(userId)
    .digest('base64url')
    .slice(0, 32);

/**
 * Token de la baja de estos emails. No vence: el link viaja en emails viejos y
 * tiene que seguir funcionando. Sólo permite ver y cambiar esta preferencia.
 */
export const signOptOutToken = (userId: string): string =>
  `${userId}.${signature(userId)}`;

/** Devuelve el id del usuario si el token es válido, o null. */
export const verifyOptOutToken = (token?: string | null): string | null => {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const received = token.slice(dot + 1);
  const expected = signature(userId);
  if (received.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    ? userId
    : null;
};
