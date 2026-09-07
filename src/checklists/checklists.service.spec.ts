import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ChecklistsService } from './checklists.service';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { Checklist } from './entities/checklist.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { ChecklistCompanion } from './entities/checklist-companion.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Employee } from 'src/hr/entities/employee.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Document } from 'src/documents/entities/document.entity';
import { DriversService } from 'src/drivers/drivers.service';
import { AttachmentsService } from 'src/common/attachments/attachments.service';
import { SettingsService } from 'src/settings/settings.service';
import { SETTING } from 'src/settings/settings.catalog';
import { AlertsService } from 'src/alerts/alerts.service';
import {
  ChecklistAnswer,
  ChecklistItemStatus,
  ChecklistItemType,
  ChecklistResult,
} from 'src/common/enums/checklist.enum';

const driver = { id: 'driver-1', companyId: 'company-test', role: 'driver' } as any;
const trafico = { id: 'user-9', companyId: 'company-test', role: 'dispatcher' } as any;

const item = (
  status: ChecklistItemStatus,
  extra: Partial<ChecklistItem> = {},
): ChecklistItem =>
  ({
    id: `item-${Math.random()}`,
    label: 'Frenos',
    status,
    type: ChecklistItemType.CONDITION,
    expectedAnswer: ChecklistAnswer.YES,
    isCritical: false,
    requiresPhotoOnFail: false,
    requiresPhoto: false,
    minPhotos: 1,
    maxPhotos: null,
    requiresValidationOnFail: false,
    ...extra,
  }) as ChecklistItem;

describe('ChecklistsService', () => {
  let service: ChecklistsService;
  let checklists: { findOne: jest.Mock; save: jest.Mock; find: jest.Mock };
  let items: { findOne: jest.Mock; save: jest.Mock };
  let companions: { create: jest.Mock; save: jest.Mock };
  let attachments: { listByEntity: jest.Mock };
  let alerts: { createFromChecklist: jest.Mock };
  let employees: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let drivers: { findOne: jest.Mock };
  let documents: { exists: jest.Mock };
  /** Ajustes de la empresa. Vacío = todos en su valor por defecto. */
  let ajustes: Record<string, boolean>;

  const firmarCon = async (
    itemsDelChecklist: ChecklistItem[],
    checklist: Partial<Checklist> = {},
  ) => {
    checklists.findOne.mockResolvedValue({
      id: 'chk-1',
      driverId: 'driver-1',
      tripId: 'trip-1',
      items: itemsDelChecklist,
      companions: [],
      ...checklist,
    });
    return service.sign('chk-1', { signatureKey: 'firma.png' } as any, driver);
  };

  beforeEach(async () => {
    ajustes = {};
    checklists = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (c) => c),
    };
    items = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (i) => i),
    };
    companions = {
      create: jest.fn().mockImplementation((c) => ({ ...c })),
      save: jest.fn().mockImplementation(async (c) => ({ id: 'cmp-1', ...c })),
    };
    attachments = { listByEntity: jest.fn().mockResolvedValue([]) };
    alerts = { createFromChecklist: jest.fn() };
    employees = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(),
    };
    drivers = { findOne: jest.fn().mockResolvedValue(null) };
    documents = { exists: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistsService,
        { provide: getRepositoryToken(Checklist), useValue: checklists },
        { provide: getRepositoryToken(ChecklistItem), useValue: items },
        { provide: getRepositoryToken(ChecklistCompanion), useValue: companions },
        { provide: getRepositoryToken(Truck), useValue: {} },
        // Sólo los usa el acompañante que ya está en el sistema.
        { provide: getRepositoryToken(Employee), useValue: employees },
        { provide: getRepositoryToken(Driver), useValue: drivers },
        { provide: getRepositoryToken(Document), useValue: documents },
        {
          provide: DriversService,
          useValue: { findByUserId: jest.fn().mockResolvedValue({ id: 'driver-1' }) },
        },
        { provide: ChecklistTemplatesService, useValue: {} },
        { provide: AttachmentsService, useValue: attachments },
        {
          provide: SettingsService,
          useValue: {
            getBoolean: jest.fn(async (key: string) => {
              // El default de `allowCompanion` es `true`; el resto, `false`.
              if (key === SETTING.CHECKLIST_ALLOW_COMPANION) {
                return ajustes[key] ?? true;
              }
              return ajustes[key] ?? false;
            }),
          },
        },
        { provide: AlertsService, useValue: alerts },
      ],
    }).compile();

    service = module.get(ChecklistsService);
  });

  describe('sign', () => {
    it('aprueba cuando no falla nada', async () => {
      const firmado = await firmarCon([item(ChecklistItemStatus.OK)]);
      expect(firmado.result).toBe(ChecklistResult.APPROVED);
      expect(firmado.signedAt).toBeInstanceOf(Date);
    });

    it('aprueba con una falla que no es crítica', async () => {
      const firmado = await firmarCon([
        item(ChecklistItemStatus.OK),
        item(ChecklistItemStatus.FAIL),
      ]);
      expect(firmado.result).toBe(ChecklistResult.APPROVED);
    });

    it('rechaza si falla un punto crítico', async () => {
      const firmado = await firmarCon([
        item(ChecklistItemStatus.OK),
        item(ChecklistItemStatus.FAIL, { isCritical: true, label: 'Frenos' }),
      ]);
      expect(firmado.result).toBe(ChecklistResult.REJECTED);
    });

    it('no deja firmar una falla que exige foto si no hay adjunto', async () => {
      await expect(
        firmarCon([
          item(ChecklistItemStatus.FAIL, {
            requiresPhotoOnFail: true,
            label: 'Cubiertas',
          }),
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('deja firmar si la falla que exige foto tiene su adjunto', async () => {
      attachments.listByEntity.mockResolvedValue([{ id: 'att-1' }]);
      const firmado = await firmarCon([
        item(ChecklistItemStatus.FAIL, { requiresPhotoOnFail: true }),
      ]);
      expect(firmado.result).toBe(ChecklistResult.APPROVED);
    });

    it('sólo pide foto de los ítems que fallaron', async () => {
      await firmarCon([
        item(ChecklistItemStatus.OK, { requiresPhotoOnFail: true }),
        item(ChecklistItemStatus.NA, { requiresPhotoOnFail: true }),
      ]);
      expect(attachments.listByEntity).not.toHaveBeenCalled();
    });

    it('exige la foto obligatoria aunque el punto esté conforme', async () => {
      await expect(
        firmarCon([
          item(ChecklistItemStatus.OK, {
            requiresPhoto: true,
            label: 'Interior del furgón',
          }),
        ]),
      ).rejects.toThrow(/Interior del furgón/);
    });

    it('exige el mínimo de fotos, no una sola', async () => {
      attachments.listByEntity.mockResolvedValue([{ id: 'att-1' }]);
      await expect(
        firmarCon([
          item(ChecklistItemStatus.OK, { requiresPhoto: true, minPhotos: 3 }),
        ]),
      ).rejects.toThrow(/1\/3/);
    });

    it('rechaza si se pasó del máximo de fotos', async () => {
      attachments.listByEntity.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      await expect(
        firmarCon([item(ChecklistItemStatus.OK, { maxPhotos: 1 })]),
      ).rejects.toThrow(/máximo 1/);
    });

    it('no deja firmar con una declaración sin aceptar', async () => {
      await expect(
        firmarCon([
          item(ChecklistItemStatus.NA, {
            type: ChecklistItemType.ACK,
            label: 'Leído y soy consciente',
          }),
        ]),
      ).rejects.toThrow(/Leído y soy consciente/);
    });

    it('deja firmar con la declaración aceptada', async () => {
      const firmado = await firmarCon([
        item(ChecklistItemStatus.OK, { type: ChecklistItemType.ACK }),
      ]);
      expect(firmado.result).toBe(ChecklistResult.APPROVED);
    });

    // ─── Validación de Tráfico ───

    it('con el ajuste apagado, una falla no crítica sigue aprobando', async () => {
      const firmado = await firmarCon([item(ChecklistItemStatus.FAIL)]);
      expect(firmado.result).toBe(ChecklistResult.APPROVED);
    });

    it('deja pendiente de validación si la empresa lo exige ante una falla', async () => {
      ajustes[SETTING.CHECKLIST_REQUIRE_VALIDATION_ON_FAIL] = true;
      const firmado = await firmarCon([item(ChecklistItemStatus.FAIL)]);
      expect(firmado.result).toBe(ChecklistResult.PENDING_VALIDATION);
    });

    it('deja pendiente de validación por un punto que lo pide, sin ajuste', async () => {
      const firmado = await firmarCon([
        item(ChecklistItemStatus.FAIL, { requiresValidationOnFail: true }),
      ]);
      expect(firmado.result).toBe(ChecklistResult.PENDING_VALIDATION);
    });

    it('una falla crítica rechaza aunque haya que validar', async () => {
      ajustes[SETTING.CHECKLIST_REQUIRE_VALIDATION_ON_FAIL] = true;
      const firmado = await firmarCon([
        item(ChecklistItemStatus.FAIL, { isCritical: true }),
      ]);
      expect(firmado.result).toBe(ChecklistResult.REJECTED);
    });

    it('deja pendiente de validación por acompañante, con todo conforme', async () => {
      ajustes[SETTING.CHECKLIST_REQUIRE_VALIDATION_WITH_COMPANION] = true;
      const firmado = await firmarCon([item(ChecklistItemStatus.OK)], {
        hasCompanion: true,
        companions: [{ id: 'c1', fullName: 'Ana', insuranceRequested: true } as any],
      });
      expect(firmado.result).toBe(ChecklistResult.PENDING_VALIDATION);
    });

    // ─── Acompañantes ───

    it('no deja firmar si declaró acompañante y no cargó a nadie', async () => {
      await expect(
        firmarCon([item(ChecklistItemStatus.OK)], { hasCompanion: true }),
      ).rejects.toThrow(/cargá sus datos/);
    });

    it('exige el seguro del acompañante cuando la empresa lo pide', async () => {
      ajustes[SETTING.CHECKLIST_REQUIRE_COMPANION_INSURANCE] = true;
      await expect(
        firmarCon([item(ChecklistItemStatus.OK)], {
          hasCompanion: true,
          companions: [
            { id: 'c1', fullName: 'Ana', insuranceRequested: false } as any,
          ],
        }),
      ).rejects.toThrow(/Ana/);
    });

    it('exige el documento del acompañante cuando la empresa lo pide', async () => {
      ajustes[SETTING.CHECKLIST_REQUIRE_COMPANION_DOCUMENT] = true;
      await expect(
        firmarCon([item(ChecklistItemStatus.OK)], {
          hasCompanion: true,
          companions: [{ id: 'c1', fullName: 'Ana', document: null } as any],
        }),
      ).rejects.toThrow(/documento/);
    });

    it('rechaza el acompañante si la empresa no los admite', async () => {
      ajustes[SETTING.CHECKLIST_ALLOW_COMPANION] = false;
      await expect(
        firmarCon([item(ChecklistItemStatus.OK)], {
          hasCompanion: true,
          companions: [{ id: 'c1', fullName: 'Ana' } as any],
        }),
      ).rejects.toThrow(/no permite/);
    });

    // ─── Ubicación y aviso ───

    it('exige la ubicación si la empresa la pide', async () => {
      ajustes[SETTING.CHECKLIST_REQUIRE_GEOLOCATION] = true;
      await expect(firmarCon([item(ChecklistItemStatus.OK)])).rejects.toThrow(
        /ubicación/,
      );
    });

    it('no avisa a tráfico con el ajuste apagado', async () => {
      await firmarCon([item(ChecklistItemStatus.FAIL, { isCritical: true })]);
      expect(alerts.createFromChecklist).not.toHaveBeenCalled();
    });

    it('avisa a tráfico cuando la planilla no queda conforme', async () => {
      ajustes[SETTING.CHECKLIST_ALERT_ON_REJECT] = true;
      await firmarCon([
        item(ChecklistItemStatus.FAIL, { isCritical: true, label: 'Frenos' }),
      ]);
      expect(alerts.createFromChecklist).toHaveBeenCalledWith(
        expect.objectContaining({
          result: ChecklistResult.REJECTED,
          motivos: ['Frenos'],
        }),
      );
    });

    it('no avisa cuando la planilla quedó conforme', async () => {
      ajustes[SETTING.CHECKLIST_ALERT_ON_REJECT] = true;
      await firmarCon([item(ChecklistItemStatus.OK)]);
      expect(alerts.createFromChecklist).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    const conItem = (extra: Partial<ChecklistItem>) => {
      items.findOne.mockResolvedValue({
        ...item(ChecklistItemStatus.NA, extra),
        checklist: { driverId: 'driver-1', signedAt: null },
      });
    };

    it('un SÍ es conforme cuando la respuesta esperada es SÍ', async () => {
      conItem({ expectedAnswer: ChecklistAnswer.YES });
      const guardado = await service.updateItem(
        'item-1',
        { answer: ChecklistAnswer.YES },
        driver,
      );
      expect(guardado.status).toBe(ChecklistItemStatus.OK);
      expect(guardado.answer).toBe(ChecklistAnswer.YES);
    });

    it('un SÍ es falla cuando la pregunta está en negativo', async () => {
      // «¿Tiene pérdidas de aceite?» espera NO.
      conItem({ expectedAnswer: ChecklistAnswer.NO });
      const guardado = await service.updateItem(
        'item-1',
        { answer: ChecklistAnswer.YES },
        driver,
      );
      expect(guardado.status).toBe(ChecklistItemStatus.FAIL);
    });

    it('un NO es conforme cuando la pregunta está en negativo', async () => {
      conItem({ expectedAnswer: ChecklistAnswer.NO });
      const guardado = await service.updateItem(
        'item-1',
        { answer: ChecklistAnswer.NO },
        driver,
      );
      expect(guardado.status).toBe(ChecklistItemStatus.OK);
    });

    it('no aplica queda en NA cualquiera sea la polaridad', async () => {
      conItem({ expectedAnswer: ChecklistAnswer.NO });
      const guardado = await service.updateItem(
        'item-1',
        { answer: ChecklistAnswer.NA },
        driver,
      );
      expect(guardado.status).toBe(ChecklistItemStatus.NA);
    });

    it('sigue aceptando el status directo de los clientes viejos', async () => {
      conItem({});
      const guardado = await service.updateItem(
        'item-1',
        { status: ChecklistItemStatus.FAIL },
        driver,
      );
      expect(guardado.status).toBe(ChecklistItemStatus.FAIL);
    });
  });

  describe('addCompanion', () => {
    const conChecklist = () =>
      checklists.findOne.mockResolvedValue({
        id: 'chk-1',
        driverId: 'driver-1',
        tripId: 'trip-1',
        items: [],
        companions: [],
      });

    it('tipea los datos cuando la persona no está en el sistema', async () => {
      conChecklist();
      const guardado = await service.addCompanion(
        'chk-1',
        { fullName: 'Ana Pérez', document: '30123456' },
        driver,
      );
      expect(guardado.fullName).toBe('Ana Pérez');
      expect(guardado.idDocumentOnFile).toBeFalsy();
      expect(employees.findOne).not.toHaveBeenCalled();
    });

    it('copia nombre y documento del legajo, no de lo que manda el cliente', async () => {
      conChecklist();
      employees.findOne.mockResolvedValue({
        id: 'emp-9',
        firstName: 'Juan',
        lastName: 'Gómez',
        documentId: '28999111',
      });

      const guardado = await service.addCompanion(
        'chk-1',
        // El cliente manda otro nombre y otro documento: gana el legajo.
        { employeeId: 'emp-9', fullName: 'Otro', document: '11111111' },
        driver,
      );
      expect(guardado.fullName).toBe('Juan Gómez');
      expect(guardado.document).toBe('28999111');
    });

    it('marca que el DNI ya está cargado si la persona tiene su documento', async () => {
      conChecklist();
      employees.findOne.mockResolvedValue({
        id: 'emp-9',
        firstName: 'Juan',
        lastName: 'Gómez',
        documentId: '28999111',
      });
      drivers.findOne.mockResolvedValue({ id: 'drv-9' });
      documents.exists.mockResolvedValue(true);

      const guardado = await service.addCompanion(
        'chk-1',
        { employeeId: 'emp-9' },
        driver,
      );
      expect(guardado.idDocumentOnFile).toBe(true);
    });

    it('sin perfil de chofer no hay DNI cargado: hay que adjuntarlo', async () => {
      conChecklist();
      employees.findOne.mockResolvedValue({
        id: 'emp-9',
        firstName: 'Ana',
        lastName: 'Ruiz',
        documentId: '30123456',
      });
      drivers.findOne.mockResolvedValue(null);

      const guardado = await service.addCompanion(
        'chk-1',
        { employeeId: 'emp-9' },
        driver,
      );
      expect(guardado.idDocumentOnFile).toBe(false);
      expect(documents.exists).not.toHaveBeenCalled();
    });

    it('falla si el legajo no existe', async () => {
      conChecklist();
      employees.findOne.mockResolvedValue(null);
      await expect(
        service.addCompanion('chk-1', { employeeId: 'emp-fantasma' }, driver),
      ).rejects.toThrow(/legajo/);
    });
  });

  describe('validate', () => {
    const pendiente = (extra: Partial<Checklist> = {}) =>
      checklists.findOne.mockResolvedValue({
        id: 'chk-1',
        driverId: 'driver-1',
        result: ChecklistResult.PENDING_VALIDATION,
        items: [],
        companions: [],
        ...extra,
      });

    it('libera la unidad y deja quién y cuándo', async () => {
      pendiente();
      const validado = await service.validate('chk-1', { approved: true }, trafico);
      expect(validado.result).toBe(ChecklistResult.APPROVED);
      expect(validado.validatedBy).toBe('user-9');
      expect(validado.validatedAt).toBeInstanceOf(Date);
    });

    it('no libera y guarda el motivo', async () => {
      pendiente();
      const validado = await service.validate(
        'chk-1',
        { approved: false, notes: 'Falta el seguro del acompañante.' },
        trafico,
      );
      expect(validado.result).toBe(ChecklistResult.REJECTED);
      expect(validado.validationNotes).toBe('Falta el seguro del acompañante.');
    });

    it('exige motivo para no liberar', async () => {
      pendiente();
      await expect(
        service.validate('chk-1', { approved: false }, trafico),
      ).rejects.toThrow(/motivo/);
    });

    it('no valida una planilla que ya se resolvió al firmarse', async () => {
      pendiente({ result: ChecklistResult.APPROVED });
      await expect(
        service.validate('chk-1', { approved: true }, trafico),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('isApprovedForTrip', () => {
    it('una planilla pendiente de validación no habilita la salida', async () => {
      checklists.findOne.mockResolvedValue({
        result: ChecklistResult.PENDING_VALIDATION,
      });
      expect(await service.isApprovedForTrip('trip-1')).toBe(false);
    });

    it('una aprobada sí', async () => {
      checklists.findOne.mockResolvedValue({ result: ChecklistResult.APPROVED });
      expect(await service.isApprovedForTrip('trip-1')).toBe(true);
    });
  });
});
