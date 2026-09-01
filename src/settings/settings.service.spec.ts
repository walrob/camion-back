import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CompanySetting } from './entities/company-setting.entity';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { SETTING } from './settings.catalog';

const admin = { id: 'user-1', companyId: 'company-test', role: 'admin' } as any;

/**
 * Repositorio en memoria: alcanza para lo que se prueba acá, que es el merge con
 * los defaults y la validación de valores. El aislamiento por empresa lo cubre
 * `tenant-entities.spec.ts`.
 */
const fakeRepo = () => {
  const filas: CompanySetting[] = [];
  return {
    filas,
    find: jest.fn(async () => filas),
    findOne: jest.fn(
      async ({ where }: any) => filas.find((f) => f.key === where.key) ?? null,
    ),
    create: jest.fn((data: Partial<CompanySetting>) => ({ ...data }) as CompanySetting),
    save: jest.fn(async (fila: CompanySetting) => {
      const i = filas.findIndex((f) => f.key === fila.key);
      if (i >= 0) filas[i] = fila;
      else filas.push(fila);
      return fila;
    }),
  };
};

describe('SettingsService', () => {
  let service: SettingsService;
  let repo: ReturnType<typeof fakeRepo>;
  const registrar = jest.fn();

  beforeEach(async () => {
    repo = fakeRepo();
    registrar.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(CompanySetting), useValue: repo },
        { provide: AuditLogService, useValue: { registrar } },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('sin filas guardadas devuelve los defaults del código', async () => {
    const valores = await service.all();
    // Es el default que preserva el comportamiento anterior: antes de que esto
    // fuera configurable, el checklist era obligatorio siempre.
    expect(valores[SETTING.TRIP_REQUIRE_CHECKLIST]).toBe('true');
    expect(valores[SETTING.TRIP_CODE_PREFIX]).toBe('V-');
    expect(repo.filas).toHaveLength(0);
  });

  it('guarda sólo lo que cambió y lo audita una vez', async () => {
    await service.update(
      {
        [SETTING.TRIP_REQUIRE_CHECKLIST]: 'false',
        // Igual al default: no debería generar fila ni auditoría.
        [SETTING.TRIP_CODE_PREFIX]: 'V-',
      },
      admin,
    );

    expect(repo.filas.map((f) => f.key)).toEqual([SETTING.TRIP_REQUIRE_CHECKLIST]);
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(await service.getBoolean(SETTING.TRIP_REQUIRE_CHECKLIST)).toBe(false);
  });

  it('no audita cuando no hubo ningún cambio real', async () => {
    await service.update({ [SETTING.TRIP_REQUIRE_CHECKLIST]: 'true' }, admin);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('rechaza una clave que no existe en el catálogo', async () => {
    await expect(service.update({ 'trip.loQueSea': 'true' }, admin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un booleano que no es true/false', async () => {
    await expect(
      service.update({ [SETTING.TRIP_REQUIRE_CHECKLIST]: 'si' }, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un texto más largo que el máximo declarado', async () => {
    await expect(
      service.update({ [SETTING.TRIP_CODE_PREFIX]: 'PREFIJO-DEMASIADO-LARGO' }, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('describe() marca cuáles siguen en su valor por defecto', async () => {
    await service.update({ [SETTING.FUEL_REQUIRE_ODOMETER]: 'true' }, admin);
    const { settings } = await service.describe();

    const odometro = settings.find((s) => s.key === SETTING.FUEL_REQUIRE_ODOMETER);
    const reapertura = settings.find((s) => s.key === SETTING.SETTLEMENT_ALLOW_REOPEN);

    expect(odometro?.isDefault).toBe(false);
    expect(reapertura?.isDefault).toBe(true);
  });
});
