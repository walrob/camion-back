import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { Alert } from './entities/alert.entity';
import { AlertRuleConfig } from './entities/alert-rule-config.entity';
import { AlertsGateway } from './alerts.gateway';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { LimitsService } from 'src/plans/limits.service';
import { TenantCronRunner } from 'src/common/tenant/tenant-cron.runner';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { PlanContextService } from 'src/plans/plan-context.service';
import { Feature } from 'src/common/enums/feature.enum';
import { ALERT_RULE } from './alerts.catalog';

// El cupo del plan se valida contra la empresa del contexto.
jest.mock('src/common/tenant/tenant-context', () => ({
  getCurrentCompanyId: () => 'company-test',
  runAsSystem: (fn: () => unknown) => fn(),
}));

const admin = { id: 'user-1', companyId: 'company-test', role: 'admin' } as any;

describe('AlertsService: reglas del motor', () => {
  let service: AlertsService;
  let configRepo: {
    filas: AlertRuleConfig[];
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let limits: { assertCanCreate: jest.Mock };
  let planContext: { obtener: jest.Mock };

  const conFeatureDeUmbrales = (tiene: boolean) =>
    planContext.obtener.mockResolvedValue({
      features: tiene ? [Feature.ALERT_THRESHOLDS] : [],
    });

  beforeEach(async () => {
    const filas: AlertRuleConfig[] = [];
    configRepo = {
      filas,
      find: jest.fn(async () => filas),
      findOne: jest.fn(
        async ({ where }: any) => filas.find((f) => f.key === where.key) ?? null,
      ),
      create: jest.fn((d: Partial<AlertRuleConfig>) => ({ ...d }) as AlertRuleConfig),
      save: jest.fn(async (fila: AlertRuleConfig) => {
        const i = filas.findIndex((f) => f.key === fila.key);
        if (i >= 0) filas[i] = fila;
        else filas.push(fila);
        return fila;
      }),
    };
    limits = { assertCanCreate: jest.fn() };
    planContext = { obtener: jest.fn() };
    conFeatureDeUmbrales(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getRepositoryToken(Alert), useValue: {} },
        { provide: getRepositoryToken(AlertRuleConfig), useValue: configRepo },
        { provide: getRepositoryToken(Truck), useValue: {} },
        { provide: getRepositoryToken(Trip), useValue: {} },
        { provide: getRepositoryToken(TripLogEntry), useValue: {} },
        { provide: AlertsGateway, useValue: { emitNew: jest.fn() } },
        { provide: LimitsService, useValue: limits },
        { provide: TenantCronRunner, useValue: { porEmpresa: jest.fn() } },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
        { provide: PlanContextService, useValue: planContext },
      ],
    }).compile();

    service = module.get(AlertsService);
  });

  it('sin configuración, todas las reglas están activas con su valor de fábrica', async () => {
    const reglas = await service.reglas();
    expect(reglas.every((r) => r.enabled)).toBe(true);
    expect(reglas.every((r) => !r.personalizada)).toBe(true);
    expect(await service.getThreshold(ALERT_RULE.TRUCK_IDLE)).toBe(6);
    expect(await service.getThreshold(ALERT_RULE.DOCUMENT_EXPIRY)).toBe(30);
  });

  it('guarda un umbral propio y lo devuelve como efectivo', async () => {
    await service.guardarReglas(
      [{ key: ALERT_RULE.TRUCK_IDLE, enabled: true, value: '12' }],
      admin,
    );
    expect(await service.getThreshold(ALERT_RULE.TRUCK_IDLE)).toBe(12);
  });

  it('apagar una regla la saca del motor', async () => {
    await service.guardarReglas(
      [{ key: ALERT_RULE.TRUCK_IDLE, enabled: false }],
      admin,
    );
    expect(await service.reglaActiva(ALERT_RULE.TRUCK_IDLE)).toBe(false);
    // Y el umbral sigue devolviendo su valor: apagada no es cero.
    expect(await service.getThreshold(ALERT_RULE.TRUCK_IDLE)).toBe(6);
  });

  it('las reglas de incidentes y RRHH no se pueden apagar', async () => {
    await expect(
      service.guardarReglas([{ key: ALERT_RULE.INCIDENT, enabled: false }], admin),
    ).rejects.toThrow(BadRequestException);
    expect(await service.reglaActiva(ALERT_RULE.INCIDENT)).toBe(true);
  });

  it('sin el plan Gestión no se puede cambiar un umbral, pero sí apagar la regla', async () => {
    conFeatureDeUmbrales(false);

    await expect(
      service.guardarReglas([{ key: ALERT_RULE.TRUCK_IDLE, value: '12' }], admin),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.guardarReglas([{ key: ALERT_RULE.TRUCK_IDLE, enabled: false }], admin),
    ).resolves.toBeDefined();
  });

  it('rechaza un umbral fuera del rango de la regla', async () => {
    await expect(
      service.guardarReglas(
        [{ key: ALERT_RULE.TRUCK_IDLE, value: '5000' }],
        admin,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('el cupo del plan se consume al configurar una regla por primera vez', async () => {
    await service.guardarReglas(
      [{ key: ALERT_RULE.TRUCK_IDLE, value: '12' }],
      admin,
    );
    expect(limits.assertCanCreate).toHaveBeenCalledWith('company-test', 'alertRules');

    // Editar la misma regla no consume otra: la fila ya existía.
    limits.assertCanCreate.mockClear();
    await service.guardarReglas(
      [{ key: ALERT_RULE.TRUCK_IDLE, value: '10' }],
      admin,
    );
    expect(limits.assertCanCreate).not.toHaveBeenCalled();
  });

  it('guardar los valores de fábrica no crea filas ni consume cupo', async () => {
    await service.guardarReglas(
      [{ key: ALERT_RULE.TRUCK_IDLE, enabled: true, value: '6' }],
      admin,
    );
    expect(configRepo.filas).toHaveLength(0);
    expect(limits.assertCanCreate).not.toHaveBeenCalled();
  });
});
