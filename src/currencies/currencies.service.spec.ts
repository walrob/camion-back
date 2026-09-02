import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { CompanyCurrency } from './entities/company-currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { FuelRecord } from 'src/fuel/entities/fuel-record.entity';
import { SettingsService } from 'src/settings/settings.service';

const admin = { id: 'user-1', companyId: 'company-test', role: 'admin' } as any;

describe('CurrenciesService', () => {
  let service: CurrenciesService;
  let rates: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let tripLog: { find: jest.Mock; save: jest.Mock; count: jest.Mock };
  let fuel: { find: jest.Mock; save: jest.Mock; count: jest.Mock };

  beforeEach(async () => {
    rates = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((r) => ({ ...r })),
      save: jest.fn().mockImplementation(async (r) => r),
    };
    tripLog = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (e) => e),
      count: jest.fn().mockResolvedValue(0),
    };
    fuel = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (e) => e),
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrenciesService,
        { provide: getRepositoryToken(CompanyCurrency), useValue: { find: jest.fn().mockResolvedValue([]), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ExchangeRate), useValue: rates },
        { provide: getRepositoryToken(TripLogEntry), useValue: tripLog },
        { provide: getRepositoryToken(FuelRecord), useValue: fuel },
        // Moneda base de la empresa: pesos.
        { provide: SettingsService, useValue: { getString: jest.fn().mockResolvedValue('ARS') } },
      ],
    }).compile();

    service = module.get(CurrenciesService);
  });

  it('un gasto en la moneda base no necesita cotización', async () => {
    const fx = await service.convertir(1000, 'ARS', '2026-09-01');
    expect(fx).toEqual({ currency: 'ARS', exchangeRate: 1, amountBase: 1000 });
    expect(rates.findOne).not.toHaveBeenCalled();
  });

  it('sin moneda declarada asume la base', async () => {
    const fx = await service.convertir(500, undefined, '2026-09-01');
    expect(fx.currency).toBe('ARS');
    expect(fx.amountBase).toBe(500);
  });

  it('convierte con la cotización vigente a la fecha del movimiento', async () => {
    rates.findOne.mockResolvedValue({ rate: '1150.000000' });
    const fx = await service.convertir(10, 'USD', '2026-09-01');
    expect(fx.exchangeRate).toBe(1150);
    expect(fx.amountBase).toBe(11500);
  });

  it('sin cotización NO falla: deja el movimiento pendiente de conversión', async () => {
    rates.findOne.mockResolvedValue(null);
    const fx = await service.convertir(200000, 'PYG', '2026-09-01');
    expect(fx.currency).toBe('PYG');
    expect(fx.exchangeRate).toBeNull();
    expect(fx.amountBase).toBeNull();
  });

  it('cargar la cotización convierte lo que había quedado pendiente', async () => {
    tripLog.find.mockResolvedValue([
      { amount: '10', currency: 'USD', occurredAt: new Date('2026-09-01'), amountBase: null },
    ]);
    // La cotización recién cargada.
    rates.findOne.mockResolvedValue({ rate: '1150.000000' });

    await service.saveRate({ code: 'USD', date: '2026-09-01', rate: 1150 } as any, admin);

    const guardado = tripLog.save.mock.calls[0][0];
    expect(guardado.amountBase).toBe(11500);
    expect(guardado.exchangeRate).toBe(1150);
  });

  it('no acepta cotización para la moneda base', async () => {
    await expect(
      service.saveRate({ code: 'ARS', date: '2026-09-01', rate: 1 } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('no acepta una cotización de cero o negativa', async () => {
    await expect(
      service.saveRate({ code: 'USD', date: '2026-09-01', rate: 0 } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('la moneda base siempre está entre las activas, aunque no se haya cargado', async () => {
    const activas = await service.activas();
    expect(activas).toHaveLength(1);
    expect(activas[0]).toMatchObject({ code: 'ARS', isBase: true });
    expect(await service.esMultimoneda()).toBe(false);
  });
});
