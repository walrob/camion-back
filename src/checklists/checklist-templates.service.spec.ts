import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistTemplate } from './entities/checklist-template.entity';
import { ChecklistTemplateItem } from './entities/checklist-template-item.entity';
import { DEFAULT_CHECKLIST_ITEMS } from 'src/common/enums/checklist.enum';
import { PlanContextService } from 'src/plans/plan-context.service';
import { Feature } from 'src/common/enums/feature.enum';

// El gating por plan se resuelve contra la empresa del contexto, que en un test
// unitario no existe: se fija acá para poder probarlo.
jest.mock('src/common/tenant/tenant-context', () => ({
  getCurrentCompanyId: () => 'company-test',
}));

const admin = { id: 'user-1', companyId: 'company-test', role: 'admin' } as any;

const item = (key: string, extra: Partial<ChecklistTemplateItem> = {}) =>
  ({
    key,
    label: key,
    order: 0,
    isCritical: false,
    requiresPhotoOnFail: false,
    isActive: true,
    ...extra,
  }) as ChecklistTemplateItem;

describe('ChecklistTemplatesService', () => {
  let service: ChecklistTemplatesService;
  let templates: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let items: { delete: jest.Mock; save: jest.Mock; create: jest.Mock };
  let planContext: { obtener: jest.Mock };

  beforeEach(async () => {
    templates = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((t) => ({ ...t })),
      save: jest.fn().mockImplementation(async (t) => ({ id: 'tpl-1', ...t })),
    };
    items = {
      delete: jest.fn(),
      save: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((i) => ({ ...i })),
    };
    // Plan con todas las features de configuración: los casos que prueban el
    // gating lo cambian.
    planContext = {
      obtener: jest.fn().mockResolvedValue({
        features: [Feature.CHECKLIST_TEMPLATES, Feature.CHECKLIST_BY_TYPE],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistTemplatesService,
        { provide: getRepositoryToken(ChecklistTemplate), useValue: templates },
        { provide: getRepositoryToken(ChecklistTemplateItem), useValue: items },
        { provide: PlanContextService, useValue: planContext },
      ],
    }).compile();

    service = module.get(ChecklistTemplatesService);
  });

  it('sin plantillas usa los ítems por defecto del código', async () => {
    const puntos = await service.puntosPara('tractor');
    expect(puntos).toHaveLength(DEFAULT_CHECKLIST_ITEMS.length);
    expect(puntos.every((p) => !p.isCritical)).toBe(true);
  });

  it('prefiere la plantilla del tipo de unidad sobre la general', async () => {
    templates.find.mockResolvedValue([
      { vehicleType: null, items: [item('luces')] },
      { vehicleType: 'cisterna', items: [item('valvulas'), item('mangueras')] },
    ]);

    const puntos = await service.puntosPara('cisterna');
    expect(puntos.map((p) => p.key)).toEqual(['valvulas', 'mangueras']);
  });

  it('usa la general cuando no hay una del tipo de la unidad', async () => {
    templates.find.mockResolvedValue([
      { vehicleType: null, items: [item('luces')] },
      { vehicleType: 'cisterna', items: [item('valvulas')] },
    ]);

    const puntos = await service.puntosPara('furgon');
    expect(puntos.map((p) => p.key)).toEqual(['luces']);
  });

  it('ignora los ítems desactivados y respeta el orden', async () => {
    templates.find.mockResolvedValue([
      {
        vehicleType: null,
        items: [
          item('frenos', { order: 2 }),
          item('viejo', { isActive: false }),
          item('luces', { order: 1 }),
        ],
      },
    ]);

    const puntos = await service.puntosPara(null);
    expect(puntos.map((p) => p.key)).toEqual(['luces', 'frenos']);
  });

  it('rechaza dos ítems con la misma clave', async () => {
    await expect(
      service.save(
        { name: 'General', items: [{ key: 'luces', label: 'Luces' }, { key: 'luces', label: 'Luces traseras' }] } as any,
        admin,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('sin la feature de Gestión no deja crear una plantilla por tipo de unidad', async () => {
    planContext.obtener.mockResolvedValue({
      features: [Feature.CHECKLIST_TEMPLATES],
    });

    await expect(
      service.save(
        {
          name: 'Cisternas',
          vehicleType: 'cisterna',
          items: [{ key: 'valvulas', label: 'Válvulas' }],
        } as any,
        admin,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sin esa feature igual puede tener su plantilla general', async () => {
    planContext.obtener.mockResolvedValue({
      features: [Feature.CHECKLIST_TEMPLATES],
    });
    templates.findOne
      // El chequeo de "ya hay una general": no hay.
      .mockResolvedValueOnce(null)
      // La relectura con la que `save` devuelve la plantilla guardada.
      .mockResolvedValueOnce({ id: 'tpl-1', name: 'General', items: [] });

    await expect(
      service.save(
        { name: 'General', items: [{ key: 'luces', label: 'Luces' }] } as any,
        admin,
      ),
    ).resolves.toBeDefined();
  });

  it('rechaza una segunda plantilla general', async () => {
    templates.findOne.mockResolvedValue({ id: 'otra' });
    await expect(
      service.save({ name: 'General 2', items: [{ key: 'luces', label: 'Luces' }] } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });
});
