import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { Company } from 'src/companies/entities/company.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { MpWebhookEvent } from 'src/billing/entities/mp-webhook-event.entity';
import { BillingService } from 'src/billing/billing.service';
import { PlanContextService } from 'src/plans/plan-context.service';
import { SettingsService } from 'src/settings/settings.service';
import { getCurrentCompanyId } from 'src/common/tenant/tenant-context';

describe('SuperadminService.configuracionDe', () => {
  let service: SuperadminService;
  let companies: { exists: jest.Mock };
  let settings: { describe: jest.Mock };
  /** La empresa que veía el contexto en el momento de leer los ajustes. */
  let empresaAlLeer: string | undefined;

  beforeEach(async () => {
    empresaAlLeer = undefined;
    companies = { exists: jest.fn().mockResolvedValue(true) };
    settings = {
      describe: jest.fn(async () => {
        empresaAlLeer = getCurrentCompanyId();
        return { groups: [], settings: [] };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperadminService,
        { provide: getRepositoryToken(Company), useValue: companies },
        { provide: getRepositoryToken(Plan), useValue: {} },
        { provide: getRepositoryToken(MpWebhookEvent), useValue: {} },
        { provide: BillingService, useValue: {} },
        { provide: PlanContextService, useValue: {} },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(SuperadminService);
  });

  /**
   * Lo que hace correcta a esta lectura: los ajustes se leen **dentro del
   * contexto de la empresa consultada**. Sin eso, el repositorio tenant-aware
   * devolvería los ajustes de otra empresa —o ninguno— y soporte estaría
   * mirando una configuración que no es la del cliente que reclama.
   */
  it('lee los ajustes en el contexto de la empresa consultada', async () => {
    await service.configuracionDe('company-42');
    expect(empresaAlLeer).toBe('company-42');
  });

  it('devuelve la misma forma que GET /settings', async () => {
    const salida = await service.configuracionDe('company-42');
    expect(salida).toEqual({ groups: [], settings: [] });
    expect(settings.describe).toHaveBeenCalledTimes(1);
  });

  it('falla si la empresa no existe, sin leer ajustes de nadie', async () => {
    companies.exists.mockResolvedValue(false);
    await expect(service.configuracionDe('fantasma')).rejects.toThrow(
      NotFoundException,
    );
    expect(settings.describe).not.toHaveBeenCalled();
  });
});
