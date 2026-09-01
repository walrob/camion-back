import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentsService } from './incidents.service';
import { Incident } from './entities/incident.entity';
import { IncidentEvent } from './entities/incident-event.entity';
import { IncidentsGateway } from './incidents.gateway';
import { DriversService } from 'src/drivers/drivers.service';
import { AlertsService } from 'src/alerts/alerts.service';
import { SequencesService } from 'src/common/sequences/sequences.service';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';
import { CatalogsService } from 'src/catalogs/catalogs.service';
import {
  IncidentSeverity,
  IncidentStatus,
} from 'src/common/enums/incident.enum';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

const usuario = (role: Role): ActiveUserInterface =>
  ({ id: 'user-1', companyId: 'company-1', role }) as ActiveUserInterface;

/**
 * Qué protege este archivo: un incidente resuelto es el cierre de un hecho, no
 * un borrador. Se puede volver atrás, pero sólo de forma explícita —con motivo,
 * con rol habilitado y dejando rastro—, nunca como efecto secundario de tocar
 * la severidad o el responsable.
 */
describe('IncidentsService: qué se puede hacer con un incidente resuelto', () => {
  let service: IncidentsService;
  let incidentsRepo: { findOne: jest.Mock; save: jest.Mock };
  let eventsRepo: { create: jest.Mock; save: jest.Mock };
  let auditLog: { registrar: jest.Mock };

  /** Estado en el que arranca el incidente de cada caso. */
  const incidenteEn = (status: IncidentStatus, extra: Partial<Incident> = {}) => {
    const incident = {
      id: 'inc-1',
      code: 'INC-00007',
      status,
      severity: IncidentSeverity.MEDIUM,
      resolvedAt: status === IncidentStatus.RESOLVED ? new Date() : null,
      events: [],
      ...extra,
    } as unknown as Incident;
    incidentsRepo.findOne.mockResolvedValue(incident);
    return incident;
  };

  beforeEach(async () => {
    incidentsRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((i) => Promise.resolve(i)),
    };
    eventsRepo = {
      create: jest.fn().mockImplementation((e) => e),
      save: jest.fn().mockResolvedValue({}),
    };
    auditLog = { registrar: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: getRepositoryToken(Incident), useValue: incidentsRepo },
        { provide: getRepositoryToken(IncidentEvent), useValue: eventsRepo },
        { provide: DriversService, useValue: {} },
        { provide: IncidentsGateway, useValue: { emitUpdate: jest.fn() } },
        { provide: AlertsService, useValue: { createFromIncident: jest.fn() } },
        { provide: SequencesService, useValue: { nextCode: jest.fn() } },
        { provide: AuditLogService, useValue: auditLog },
        // Sólo lo usa `create`, para validar el tipo contra el catálogo de la
        // empresa; estos casos operan sobre incidentes ya existentes.
        { provide: CatalogsService, useValue: { items: jest.fn() } },
      ],
    }).compile();

    service = module.get(IncidentsService);
  });

  // ── Lo que estaba abierto sigue funcionando igual ─────────────────────────

  it('resuelve un incidente en curso y le pone fecha de resolución', async () => {
    incidenteEn(IncidentStatus.IN_PROGRESS);
    const user = usuario(Role.DISPATCHER);

    await service.changeStatus('inc-1', { status: IncidentStatus.RESOLVED }, user);

    const guardado = incidentsRepo.save.mock.calls[0][0];
    expect(guardado.status).toBe(IncidentStatus.RESOLVED);
    expect(guardado.resolvedAt).toBeInstanceOf(Date);
  });

  // ── Lo cerrado no se retoca por los costados ──────────────────────────────

  it('no deja reasignar un incidente resuelto', async () => {
    incidenteEn(IncidentStatus.RESOLVED);

    await expect(
      service.assign(
        'inc-1',
        { assignedToUserId: 'user-2' },
        usuario(Role.DISPATCHER),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(incidentsRepo.save).not.toHaveBeenCalled();
  });

  it('no deja cambiarle la gravedad a un incidente resuelto', async () => {
    incidenteEn(IncidentStatus.RESOLVED);

    await expect(
      service.changeSeverity(
        'inc-1',
        { severity: IncidentSeverity.CRITICAL },
        usuario(Role.ADMIN),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(incidentsRepo.save).not.toHaveBeenCalled();
  });

  it('no deja volver a resolver lo ya resuelto, que sólo pisaría la fecha', async () => {
    const incident = incidenteEn(IncidentStatus.RESOLVED);
    const resolucionOriginal = incident.resolvedAt;

    await expect(
      service.changeStatus(
        'inc-1',
        { status: IncidentStatus.RESOLVED },
        usuario(Role.ADMIN),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(incident.resolvedAt).toBe(resolucionOriginal);
  });

  // ── Reapertura ────────────────────────────────────────────────────────────

  it('exige motivo para reabrir', async () => {
    incidenteEn(IncidentStatus.RESOLVED);

    await expect(
      service.changeStatus(
        'inc-1',
        { status: IncidentStatus.IN_PROGRESS },
        usuario(Role.DISPATCHER),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(incidentsRepo.save).not.toHaveBeenCalled();
  });

  it('no deja reabrir al taller, que cierra lo suyo pero no revierte cierres', async () => {
    incidenteEn(IncidentStatus.RESOLVED);

    await expect(
      service.changeStatus(
        'inc-1',
        { status: IncidentStatus.IN_PROGRESS, note: 'volvió a romperse' },
        usuario(Role.MAINTENANCE),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(incidentsRepo.save).not.toHaveBeenCalled();
  });

  it('reabre con motivo: limpia la resolución, deja evento y queda auditado', async () => {
    incidenteEn(IncidentStatus.RESOLVED);
    const user = usuario(Role.DISPATCHER);

    await service.changeStatus(
      'inc-1',
      { status: IncidentStatus.IN_PROGRESS, note: '  volvió a fallar en ruta  ' },
      user,
    );

    const guardado = incidentsRepo.save.mock.calls[0][0];
    expect(guardado.status).toBe(IncidentStatus.IN_PROGRESS);
    expect(guardado.resolvedAt).toBeNull();

    // El evento es lo que ve el despacho en la ficha…
    expect(eventsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentId: 'inc-1',
        action: 'reopened',
        note: 'volvió a fallar en ruta',
      }),
    );
    // …y la auditoría es lo que sobrevive al incidente.
    expect(auditLog.registrar).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        action: AUDIT.INCIDENT_REOPENED,
        entityId: 'inc-1',
        metadata: expect.objectContaining({ motivo: 'volvió a fallar en ruta' }),
      }),
    );
  });
});
