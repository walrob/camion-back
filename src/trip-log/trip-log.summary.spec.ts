import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TripLogService } from './trip-log.service';
import { TripLogEntry } from './entities/trip-log-entry.entity';
import { TripsService } from 'src/trips/trips.service';
import { DriversService } from 'src/drivers/drivers.service';
import { AlertsService } from 'src/alerts/alerts.service';
import { CatalogsService } from 'src/catalogs/catalogs.service';
import { CurrenciesService } from 'src/currencies/currencies.service';
import { SettingsService } from 'src/settings/settings.service';
import { BEHAVIOR } from 'src/catalogs/catalogs.catalog';

/** Movimiento ya convertido a moneda base. */
const mov = (type: string, amount: number, extra: Partial<TripLogEntry> = {}) =>
  ({
    type,
    amount,
    amountBase: amount,
    currency: 'ARS',
    ...extra,
  }) as TripLogEntry;

describe('TripLogService.summary', () => {
  let service: TripLogService;
  let repo: { find: jest.Mock };
  let settings: { getString: jest.Mock };

  const conModoDeViatico = (modo: string) =>
    settings.getString.mockResolvedValue(modo);

  beforeEach(async () => {
    repo = { find: jest.fn().mockResolvedValue([]) };
    settings = { getString: jest.fn().mockResolvedValue('log') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripLogService,
        { provide: getRepositoryToken(TripLogEntry), useValue: repo },
        { provide: TripsService, useValue: {} },
        { provide: DriversService, useValue: {} },
        { provide: AlertsService, useValue: {} },
        {
          provide: CatalogsService,
          useValue: {
            items: jest.fn().mockResolvedValue([
              { key: 'fuel', behavior: BEHAVIOR.EXPENSE, isActive: true },
              { key: 'per_diem', behavior: BEHAVIOR.EXPENSE, isActive: true },
              { key: 'cash_advance', behavior: BEHAVIOR.ADVANCE, isActive: true },
            ]),
          },
        },
        {
          provide: CurrenciesService,
          useValue: { base: jest.fn().mockResolvedValue('ARS') },
        },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(TripLogService);
  });

  it('suma gastos y resta adelantos, en moneda base', async () => {
    repo.find.mockResolvedValue([
      mov('fuel', 10000),
      mov('cash_advance', 4000),
    ]);

    const s = await service.summary('trip-1');
    expect(s.totalExpenses).toBe(10000);
    expect(s.totalAdvances).toBe(4000);
    expect(s.netToSettle).toBe(6000);
  });

  it('con viático «lo carga el chofer», el viático de bitácora suma', async () => {
    conModoDeViatico('log');
    repo.find.mockResolvedValue([mov('fuel', 10000), mov('per_diem', 5000)]);

    const s = await service.summary('trip-1');
    expect(s.totalExpenses).toBe(15000);
    expect(s.noComputado).toBe(0);
  });

  it('con viático de monto fijo, el de bitácora NO suma: lo pone el viaje', async () => {
    conModoDeViatico('fixed');
    repo.find.mockResolvedValue([mov('fuel', 10000), mov('per_diem', 5000)]);

    const s = await service.summary('trip-1');
    // Sin esta exclusión el viático se pagaría dos veces.
    expect(s.totalExpenses).toBe(10000);
    expect(s.noComputado).toBe(5000);
    // Igual se muestra en el detalle por tipo: no desaparece, no computa.
    expect(s.byType.per_diem).toBe(5000);
  });

  it('en modo «las dos cosas» el de bitácora vuelve a sumar', async () => {
    conModoDeViatico('both');
    repo.find.mockResolvedValue([mov('per_diem', 5000)]);

    const s = await service.summary('trip-1');
    expect(s.totalExpenses).toBe(5000);
    expect(s.noComputado).toBe(0);
  });

  it('lo que no tiene cotización no suma y se cuenta aparte', async () => {
    repo.find.mockResolvedValue([
      mov('fuel', 10000),
      mov('toll', 200000, { currency: 'PYG', amountBase: null }),
    ]);

    const s = await service.summary('trip-1');
    expect(s.totalExpenses).toBe(10000);
    expect(s.pendingFx).toBe(1);
    // Y el subtotal por moneda sí lo muestra: el gasto existe.
    expect(s.byCurrency.PYG).toBe(200000);
  });
});
