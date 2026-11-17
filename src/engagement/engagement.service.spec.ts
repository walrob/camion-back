import { EngagementService } from './engagement.service';
import { DAY_MS, EngagementSegment, HOUR_MS } from './engagement.rules';

const { UNVERIFIED, ACTIVATION, FIRST_TRIP, INACTIVE } = EngagementSegment;

/**
 * El planificador con los datos simulados: qué email le toca a cada uno. Las
 * consultas SQL se prueban contra la base; acá se prueban las decisiones.
 */
describe('EngagementService.plan', () => {
  const now = new Date('2026-11-18T15:00:00Z'); // miércoles, 12:00 en Argentina
  const ago = (ms: number) => new Date(now.getTime() - ms);

  const owner = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    email: 'ana@flota.com',
    name: 'Ana Pérez',
    emailVerifiedAt: ago(10 * DAY_MS),
    optOut: false,
    userCreatedAt: ago(10 * DAY_MS),
    companyId: 'c1',
    companyName: 'Flota Ana',
    companyCreatedAt: ago(10 * DAY_MS),
    ...over,
  });

  const stats = (over: Record<string, unknown> = {}) => ({
    trucks: 2,
    drivers: 2,
    driversWithApp: 1,
    expirations: 5,
    trips: 4,
    firstTripAt: ago(9 * DAY_MS),
    lastTripAt: ago(1 * DAY_MS),
    lastConnection: ago(1 * HOUR_MS),
    ...over,
  });

  /** Arma el servicio con lo que devolverían las consultas. */
  const planFor = async (
    o: ReturnType<typeof owner>,
    s: ReturnType<typeof stats>,
    sent: { segment: EngagementSegment; step: number; lastAt: Date }[] = [],
  ) => {
    const service = new EngagementService(
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as Record<string, jest.Mock> & EngagementService;
    service['findOwners'] = jest.fn().mockResolvedValue([o]);
    service['findCompanyStats'] = jest
      .fn()
      .mockResolvedValue(new Map([[o.companyId, s]]));
    service['findSent'] = jest.fn().mockResolvedValue(
      new Map([
        [
          `${o.companyId}:${o.userId}`,
          new Map(sent.map((e) => [e.segment, { step: e.step, lastAt: e.lastAt }])),
        ],
      ]),
    );
    return service.plan(now);
  };

  it('A: correo sin confirmar a la hora, aunque se haya dado de baja', async () => {
    const plans = await planFor(
      owner({
        emailVerifiedAt: null,
        optOut: true,
        userCreatedAt: ago(2 * HOUR_MS),
        companyCreatedAt: ago(2 * HOUR_MS),
      }),
      stats({ trips: 0, trucks: 0, drivers: 0 }),
    );
    expect(plans.map((p) => [p.segment, p.step])).toEqual([[UNVERIFIED, 1]]);
    expect(plans[0].subject).toBe('falta un solo paso, Ana');
  });

  it('B: sin viajes al día siguiente, y el botón lleva a lo que falta', async () => {
    const plans = await planFor(
      owner({ companyCreatedAt: ago(1 * DAY_MS + HOUR_MS) }),
      stats({ trips: 0, trucks: 0, drivers: 0, firstTripAt: null, lastTripAt: null }),
    );
    expect(plans.map((p) => [p.segment, p.step])).toEqual([[ACTIVATION, 1]]);
    expect(plans[0].context.activationGap).toBe('truck');
  });

  it('respeta el tope de un email cada 3 días', async () => {
    const plans = await planFor(
      owner({ companyCreatedAt: ago(3 * DAY_MS + HOUR_MS) }),
      stats({ trips: 0, firstTripAt: null, lastTripAt: null }),
      [{ segment: ACTIVATION, step: 1, lastAt: ago(2 * DAY_MS) }],
    );
    expect(plans).toEqual([]);
  });

  it('no le escribe a quien se dio de baja', async () => {
    const plans = await planFor(
      owner({ optOut: true, companyCreatedAt: ago(1 * DAY_MS + HOUR_MS) }),
      stats({ trips: 0, firstTripAt: null, lastTripAt: null }),
    );
    expect(plans).toEqual([]);
  });

  it('C: primer viaje reciente y ningún chofer con la app', async () => {
    const plans = await planFor(
      owner(),
      stats({ trips: 1, driversWithApp: 0, firstTripAt: ago(3 * HOUR_MS) }),
    );
    expect(plans.map((p) => [p.segment, p.step])).toEqual([[FIRST_TRIP, 1]]);
    expect(plans[0].context.firstTripGap).toBe('driverApp');
  });

  it('C no sale si ya tiene la app y los vencimientos', async () => {
    const plans = await planFor(
      owner(),
      stats({ trips: 1, firstTripAt: ago(3 * HOUR_MS) }),
    );
    expect(plans).toEqual([]);
  });

  it('D: una semana sin que nadie de la empresa entre', async () => {
    const plans = await planFor(
      owner({ emailVerifiedAt: ago(40 * DAY_MS), userCreatedAt: ago(40 * DAY_MS) }),
      stats({
        lastConnection: ago(7 * DAY_MS + HOUR_MS),
        lastTripAt: ago(20 * DAY_MS),
      }),
    );
    expect(plans.map((p) => [p.segment, p.step])).toEqual([[INACTIVE, 1]]);
  });

  it('D no sale si los choferes siguen entrando aunque el dueño no', async () => {
    // lastConnection es de cualquiera de la empresa: acá, un chofer ayer.
    const plans = await planFor(
      owner({ emailVerifiedAt: ago(40 * DAY_MS), userCreatedAt: ago(40 * DAY_MS) }),
      stats({ lastConnection: ago(1 * DAY_MS), lastTripAt: ago(20 * DAY_MS) }),
    );
    expect(plans).toEqual([]);
  });

  it('si tocan B y D a la vez, va B', async () => {
    const plans = await planFor(
      owner({
        companyCreatedAt: ago(7 * DAY_MS + HOUR_MS),
        emailVerifiedAt: ago(7 * DAY_MS + HOUR_MS),
        userCreatedAt: ago(7 * DAY_MS + HOUR_MS),
      }),
      stats({
        trips: 0,
        firstTripAt: null,
        lastTripAt: null,
        lastConnection: ago(7 * DAY_MS + HOUR_MS),
      }),
      [{ segment: ACTIVATION, step: 2, lastAt: ago(4 * DAY_MS) }],
    );
    expect(plans.map((p) => [p.segment, p.step])).toEqual([[ACTIVATION, 3]]);
  });
});
