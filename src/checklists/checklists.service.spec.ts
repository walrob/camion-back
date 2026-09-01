import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ChecklistsService } from './checklists.service';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { Checklist } from './entities/checklist.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { DriversService } from 'src/drivers/drivers.service';
import { AttachmentsService } from 'src/common/attachments/attachments.service';
import {
  ChecklistItemStatus,
  ChecklistResult,
} from 'src/common/enums/checklist.enum';

const driver = { id: 'driver-1', companyId: 'company-test', role: 'driver' } as any;

const item = (
  status: ChecklistItemStatus,
  extra: Partial<ChecklistItem> = {},
): ChecklistItem =>
  ({
    id: `item-${Math.random()}`,
    label: 'Frenos',
    status,
    isCritical: false,
    requiresPhotoOnFail: false,
    ...extra,
  }) as ChecklistItem;

describe('ChecklistsService.sign', () => {
  let service: ChecklistsService;
  let checklists: { findOne: jest.Mock; save: jest.Mock };
  let attachments: { listByEntity: jest.Mock };

  const firmarCon = async (items: ChecklistItem[]) => {
    checklists.findOne.mockResolvedValue({
      id: 'chk-1',
      driverId: 'driver-1',
      items,
    });
    return service.sign('chk-1', { signatureKey: 'firma.png' } as any, driver);
  };

  beforeEach(async () => {
    checklists = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (c) => c),
    };
    attachments = { listByEntity: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistsService,
        { provide: getRepositoryToken(Checklist), useValue: checklists },
        { provide: getRepositoryToken(ChecklistItem), useValue: {} },
        { provide: getRepositoryToken(Truck), useValue: {} },
        {
          provide: DriversService,
          useValue: { findByUserId: jest.fn().mockResolvedValue({ id: 'driver-1' }) },
        },
        { provide: ChecklistTemplatesService, useValue: {} },
        { provide: AttachmentsService, useValue: attachments },
      ],
    }).compile();

    service = module.get(ChecklistsService);
  });

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
});
