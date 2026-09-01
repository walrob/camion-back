import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CatalogItem } from './entities/catalog-item.entity';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BEHAVIOR, CATALOG, CATALOG_BY_KEY } from './catalogs.catalog';

const admin = { id: 'user-1', companyId: 'company-test', role: 'admin' } as any;

/** Todos los tipos de gasto de sistema, que es lo que exige `save`. */
const deSistema = () =>
  CATALOG_BY_KEY.get(CATALOG.EXPENSE_TYPE)!.items.map((i) => ({
    key: i.key,
    label: i.label,
  }));

describe('CatalogsService', () => {
  let service: CatalogsService;
  let repo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    filas: CatalogItem[];
  };

  beforeEach(async () => {
    const filas: CatalogItem[] = [];
    repo = {
      filas,
      find: jest.fn(async ({ where }: any) =>
        filas.filter((f) => f.catalog === where.catalog),
      ),
      create: jest.fn((d: Partial<CatalogItem>) => ({ ...d }) as CatalogItem),
      save: jest.fn(async (fila: CatalogItem) => {
        const i = filas.findIndex(
          (f) => f.catalog === fila.catalog && f.key === fila.key,
        );
        if (i >= 0) filas[i] = fila;
        else filas.push(fila);
        return fila;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogsService,
        { provide: getRepositoryToken(CatalogItem), useValue: repo },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = module.get(CatalogsService);
  });

  it('sin filas devuelve los elementos de sistema', async () => {
    const items = await service.items(CATALOG.EXPENSE_TYPE);
    expect(items).toHaveLength(deSistema().length);
    expect(items.every((i) => i.isSystem && i.isActive)).toBe(true);
  });

  it('el adelanto de fábrica resta y el resto suma', async () => {
    expect(await service.esAdelanto(CATALOG.EXPENSE_TYPE, 'cash_advance')).toBe(true);
    expect(await service.esAdelanto(CATALOG.EXPENSE_TYPE, 'fuel')).toBe(false);
  });

  it('renombrar un elemento de sistema no le cambia el comportamiento', async () => {
    const items = deSistema().map((i) =>
      i.key === 'cash_advance'
        ? // La empresa lo llama distinto y encima intenta que deje de restar.
          { ...i, label: 'Anticipo', behavior: BEHAVIOR.EXPENSE }
        : i,
    );

    await service.save(CATALOG.EXPENSE_TYPE, { items } as any, admin);

    const resueltos = await service.items(CATALOG.EXPENSE_TYPE);
    const adelanto = resueltos.find((i) => i.key === 'cash_advance');
    expect(adelanto?.label).toBe('Anticipo');
    expect(adelanto?.behavior).toBe(BEHAVIOR.ADVANCE);
    expect(await service.esAdelanto(CATALOG.EXPENSE_TYPE, 'cash_advance')).toBe(true);
  });

  it('un tipo propio marcado como adelanto también resta', async () => {
    await service.save(
      CATALOG.EXPENSE_TYPE,
      {
        items: [
          ...deSistema(),
          {
            key: 'adelanto_transferencia',
            label: 'Adelanto por transferencia',
            behavior: BEHAVIOR.ADVANCE,
          },
        ],
      } as any,
      admin,
    );

    expect(
      await service.esAdelanto(CATALOG.EXPENSE_TYPE, 'adelanto_transferencia'),
    ).toBe(true);
  });

  it('un tipo propio sin comportamiento suma, que es el default seguro', async () => {
    await service.save(
      CATALOG.EXPENSE_TYPE,
      { items: [...deSistema(), { key: 'balanza', label: 'Balanza' }] } as any,
      admin,
    );

    expect(await service.esAdelanto(CATALOG.EXPENSE_TYPE, 'balanza')).toBe(false);
  });

  it('no deja eliminar un elemento de sistema', async () => {
    const sinCombustible = deSistema().filter((i) => i.key !== 'fuel');
    await expect(
      service.save(CATALOG.EXPENSE_TYPE, { items: sinCombustible } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('desactiva los propios que salieron de la lista, en vez de borrarlos', async () => {
    await service.save(
      CATALOG.EXPENSE_TYPE,
      { items: [...deSistema(), { key: 'balanza', label: 'Balanza' }] } as any,
      admin,
    );
    await service.save(CATALOG.EXPENSE_TYPE, { items: deSistema() } as any, admin);

    const balanza = (await service.items(CATALOG.EXPENSE_TYPE)).find(
      (i) => i.key === 'balanza',
    );
    expect(balanza).toBeDefined();
    expect(balanza?.isActive).toBe(false);
  });

  it('rechaza un catálogo que no existe', async () => {
    await expect(service.items('lo_que_sea')).rejects.toThrow(BadRequestException);
  });
});
