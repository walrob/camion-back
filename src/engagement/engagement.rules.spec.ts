import {
  activationGap,
  CompanyProgress,
  DAY_MS,
  dueStep,
  EngagementSegment,
  firstName,
  firstTripGap,
  HOUR_MS,
  isBusinessHours,
  signOptOutToken,
  verifyOptOutToken,
  withUtm,
} from './engagement.rules';
import { buildEngagementMessage, esc } from './engagement.copy';

const { UNVERIFIED, ACTIVATION, FIRST_TRIP, INACTIVE } = EngagementSegment;

describe('dueStep', () => {
  it('no corresponde nada antes del primer umbral', () => {
    expect(dueStep(UNVERIFIED, 30 * 60 * 1000, 0)).toBeNull();
    expect(dueStep(ACTIVATION, 20 * HOUR_MS, 0)).toBeNull();
    expect(dueStep(INACTIVE, 6 * DAY_MS, 0)).toBeNull();
  });

  it('A: a la hora, a las 24 horas y a los 3 días', () => {
    expect(dueStep(UNVERIFIED, 1 * HOUR_MS, 0)).toBe(1);
    expect(dueStep(UNVERIFIED, 25 * HOUR_MS, 1)).toBe(2);
    expect(dueStep(UNVERIFIED, 3 * DAY_MS, 2)).toBe(3);
  });

  it('B: días 1, 3 y 7 desde el alta', () => {
    expect(dueStep(ACTIVATION, 1 * DAY_MS, 0)).toBe(1);
    expect(dueStep(ACTIVATION, 3 * DAY_MS, 1)).toBe(2);
    expect(dueStep(ACTIVATION, 7 * DAY_MS, 2)).toBe(3);
  });

  it('si tocaban dos, manda sólo el último', () => {
    // Se registró un viernes a la noche: el lunes ya pasaron 60 horas.
    expect(dueStep(UNVERIFIED, 60 * HOUR_MS, 0)).toBe(2);
  });

  it('no repite un paso ya mandado', () => {
    expect(dueStep(ACTIVATION, 3.5 * DAY_MS, 2)).toBeNull();
    expect(dueStep(FIRST_TRIP, 1 * DAY_MS, 1)).toBeNull();
  });

  it('pasado el margen de 4 días el paso se saltea', () => {
    expect(dueStep(INACTIVE, 10 * DAY_MS, 0)).toBe(1);
    expect(dueStep(INACTIVE, 12 * DAY_MS, 0)).toBeNull();
    // El histórico al primer deploy: inactivo hace cien días no recibe nada.
    expect(dueStep(INACTIVE, 100 * DAY_MS, 0)).toBeNull();
    // Ni una empresa que se registró hace dos meses y nunca cargó un viaje.
    expect(dueStep(ACTIVATION, 60 * DAY_MS, 0)).toBeNull();
  });

  it('D termina a los 30 días', () => {
    expect(dueStep(INACTIVE, 31 * DAY_MS, 2)).toBe(3);
    expect(dueStep(INACTIVE, 45 * DAY_MS, 3)).toBeNull();
  });

  it('C sale una sola vez dentro de la semana del primer viaje', () => {
    expect(dueStep(FIRST_TRIP, 2 * HOUR_MS, 0)).toBe(1);
    expect(dueStep(FIRST_TRIP, 8 * DAY_MS, 0)).toBeNull();
  });
});

describe('qué le falta a la empresa', () => {
  const vacia: CompanyProgress = {
    trucks: 0,
    drivers: 0,
    driversWithApp: 0,
    expirations: 0,
    trips: 0,
  };

  it('B lleva al primer paso que falta para cargar un viaje', () => {
    expect(activationGap(vacia)).toBe('truck');
    expect(activationGap({ ...vacia, trucks: 2 })).toBe('driver');
    expect(activationGap({ ...vacia, trucks: 2, drivers: 1 })).toBe('trip');
  });

  it('C pide la app del chofer, después los vencimientos, y si están no pide nada', () => {
    const conViaje = { ...vacia, trucks: 1, drivers: 1, trips: 1 };
    expect(firstTripGap(conViaje)).toBe('driverApp');
    expect(firstTripGap({ ...conViaje, driversWithApp: 1 })).toBe('expirations');
    expect(
      firstTripGap({ ...conViaje, driversWithApp: 1, expirations: 3 }),
    ).toBeNull();
  });
});

describe('isBusinessHours (hora de Argentina, UTC-3)', () => {
  it('lunes a viernes de 9 a 19', () => {
    expect(isBusinessHours(new Date('2026-11-16T12:00:00Z'))).toBe(true); // lun 9:00
    expect(isBusinessHours(new Date('2026-11-16T21:59:00Z'))).toBe(true); // lun 18:59
    expect(isBusinessHours(new Date('2026-11-16T22:00:00Z'))).toBe(false); // lun 19:00
    expect(isBusinessHours(new Date('2026-11-16T11:59:00Z'))).toBe(false); // lun 8:59
  });

  it('nunca el fin de semana', () => {
    expect(isBusinessHours(new Date('2026-11-21T15:00:00Z'))).toBe(false); // sáb 12:00
    expect(isBusinessHours(new Date('2026-11-22T15:00:00Z'))).toBe(false); // dom 12:00
  });
});

describe('withUtm', () => {
  it('agrega la campaña por segmento y paso', () => {
    const url = new URL(
      withUtm('https://x.com/admin/viajes?nuevo=1', ACTIVATION, 2),
    );
    expect(url.searchParams.get('utm_source')).toBe('email');
    expect(url.searchParams.get('utm_campaign')).toBe('activation_2');
    expect(url.searchParams.get('nuevo')).toBe('1');
  });

  it('no toca los mailto', () => {
    expect(withUtm('mailto:a@b.com', INACTIVE, 3)).toBe('mailto:a@b.com');
  });
});

describe('firstName', () => {
  it('toma el primer nombre con mayúscula', () => {
    expect(firstName('  ana maría lópez ')).toBe('Ana');
    expect(firstName('')).toBe('');
    expect(firstName(null)).toBe('');
  });
});

describe('token de baja', () => {
  const anterior = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'secreto-de-prueba';
  });
  afterAll(() => {
    process.env.JWT_SECRET = anterior;
  });

  it('valida el propio y rechaza uno adulterado', () => {
    const token = signOptOutToken('user-1');
    expect(verifyOptOutToken(token)).toBe('user-1');
    expect(verifyOptOutToken(token.replace('user-1', 'user-2'))).toBeNull();
    expect(verifyOptOutToken('basura')).toBeNull();
    expect(verifyOptOutToken(undefined)).toBeNull();
  });
});

describe('textos', () => {
  const casos: [EngagementSegment, number][] = [
    [UNVERIFIED, 1],
    [UNVERIFIED, 2],
    [UNVERIFIED, 3],
    [ACTIVATION, 1],
    [ACTIVATION, 2],
    [ACTIVATION, 3],
    [FIRST_TRIP, 1],
    [INACTIVE, 1],
    [INACTIVE, 2],
    [INACTIVE, 3],
  ];

  it('cada paso tiene asunto, un botón, destino y 2 párrafos como mucho', () => {
    for (const [segment, step] of casos) {
      const m = buildEngagementMessage(segment, step, { name: 'Ana' });
      expect(m.subject).toBeTruthy();
      expect(m.ctaLabel).toBeTruthy();
      expect(m.target).toBeTruthy();
      expect(m.paragraphs.length).toBeLessThanOrEqual(2);
    }
  });

  it('los asuntos son los pedidos y personales', () => {
    expect(buildEngagementMessage(INACTIVE, 3, { name: 'Ana' }).subject).toBe(
      '¿sigue sirviéndote CamioNex?',
    );
    expect(buildEngagementMessage(UNVERIFIED, 1, { name: 'Ana' }).subject).toBe(
      'falta un solo paso, Ana',
    );
    expect(buildEngagementMessage(UNVERIFIED, 1, { name: '' }).subject).toBe(
      'falta un solo paso',
    );
  });

  it('B: el botón lleva a lo que le falta', () => {
    const camion = buildEngagementMessage(ACTIVATION, 1, {
      name: 'Ana',
      activationGap: 'truck',
    });
    expect(camion.ctaLabel).toBe('Cargar mi primer camión');
    expect(camion.target).toContain('/admin/flota?tab=trucks&nuevo=camion');

    const viaje = buildEngagementMessage(ACTIVATION, 2, {
      name: 'Ana',
      activationGap: 'trip',
    });
    expect(viaje.ctaLabel).toBe('Cargar mi primer viaje');
    expect(viaje.target).toContain('/admin/viajes?nuevo=1');
  });

  it('C: la app del chofer o los vencimientos', () => {
    expect(
      buildEngagementMessage(FIRST_TRIP, 1, { name: '', firstTripGap: 'driverApp' })
        .ctaLabel,
    ).toBe('Darle la app a mi chofer');
    expect(
      buildEngagementMessage(FIRST_TRIP, 1, { name: '', firstTripGap: 'expirations' })
        .ctaLabel,
    ).toBe('Cargar los vencimientos');
  });

  it('D3 responde por mail si hay casilla de respuestas', () => {
    expect(
      buildEngagementMessage(INACTIVE, 3, { name: '', replyTo: 'walter@x.com' })
        .target,
    ).toMatch(/^mailto:walter@x\.com\?subject=/);
  });

  it('escapa el nombre en el cuerpo', () => {
    const m = buildEngagementMessage(ACTIVATION, 1, { name: '<b>x</b>' });
    expect(m.paragraphs.join(' ')).not.toContain('<b>x</b>');
    expect(esc('"<a>&\'')).toBe('&quot;&lt;a&gt;&amp;&#39;');
  });
});
