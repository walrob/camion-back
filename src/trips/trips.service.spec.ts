import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TripsService } from './trips.service';
import { Trip } from './entities/trip.entity';
import { TrucksService } from 'src/fleet/trucks.service';
import { DriversService } from 'src/drivers/drivers.service';
import { ChecklistsService } from 'src/checklists/checklists.service';
import { EmploymentMovementsService } from 'src/hr/employment-movements.service';
import { AlertsService } from 'src/alerts/alerts.service';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { EmploymentMovementType } from 'src/common/enums/employmentMovement.enum';

const activeUser = { id: 'dispatcher-1', role: 'dispatcher' };

const baseTrip = {
  truckId: 'truck-1',
  driverId: 'driver-1',
  origin: 'Buenos Aires',
  destination: 'Córdoba',
  plannedStartAt: '2026-08-10',
};

describe('TripsService: asignación según la situación del legajo', () => {
  let service: TripsService;
  let tripsRepo: { create: jest.Mock; save: jest.Mock; count: jest.Mock };
  let driversService: { findOne: jest.Mock };
  let movementsService: { statusAt: jest.Mock; closeAt: jest.Mock };
  let alertsService: { createFromLeaveAssignment: jest.Mock };

  /** Situación en la fecha del viaje y, opcionalmente, la de hoy. */
  const employmentIs = (
    atTripStart: { status: EmploymentStatus; movement?: any },
    today = atTripStart,
  ) => {
    movementsService.statusAt.mockImplementation(
      (_employeeId: string, asOf?: string) => {
        const src = asOf ? atTripStart : today;
        return Promise.resolve({
          status: src.status,
          movement: src.movement ?? null,
        });
      },
    );
  };

  beforeEach(async () => {
    tripsRepo = {
      create: jest.fn().mockImplementation((t) => t),
      save: jest.fn().mockImplementation(async (t) => ({ id: 'trip-1', ...t })),
      count: jest.fn().mockResolvedValue(0),
    };
    driversService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'driver-1',
        employee: { id: 'emp-1', firstName: 'Fernando', lastName: 'Aguirre' },
      }),
    };
    movementsService = {
      statusAt: jest
        .fn()
        .mockResolvedValue({ status: EmploymentStatus.ACTIVE, movement: null }),
      closeAt: jest.fn().mockResolvedValue({}),
    };
    alertsService = { createFromLeaveAssignment: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getRepositoryToken(Trip), useValue: tripsRepo },
        { provide: TrucksService, useValue: {} },
        { provide: DriversService, useValue: driversService },
        { provide: ChecklistsService, useValue: {} },
        { provide: EmploymentMovementsService, useValue: movementsService },
        { provide: AlertsService, useValue: alertsService },
      ],
    }).compile();

    service = module.get(TripsService);
  });

  it('asigna sin alertas si el chofer está activo', async () => {
    const trip = await service.create({ ...baseTrip }, activeUser);
    expect(trip.id).toBe('trip-1');
    expect(alertsService.createFromLeaveAssignment).not.toHaveBeenCalled();
    expect(movementsService.closeAt).not.toHaveBeenCalled();
  });

  it('rechaza el viaje si el chofer está de licencia y no se confirma el cierre', async () => {
    employmentIs({
      status: EmploymentStatus.ON_LEAVE,
      movement: {
        id: 'mov-1',
        type: EmploymentMovementType.LEAVE,
        startDate: '2026-08-01',
        endDate: '2026-08-20',
      },
    });

    await expect(service.create({ ...baseTrip }, activeUser)).rejects.toThrow(
      /de licencia hasta el 2026-08-20/,
    );
    expect(tripsRepo.save).not.toHaveBeenCalled();
    expect(movementsService.closeAt).not.toHaveBeenCalled();
  });

  it('con closeLeave finaliza la licencia el día anterior al viaje y alerta', async () => {
    employmentIs({
      status: EmploymentStatus.ON_LEAVE,
      movement: {
        id: 'mov-1',
        type: EmploymentMovementType.LEAVE,
        startDate: '2026-08-01',
        endDate: '2026-08-20',
      },
    });

    await service.create({ ...baseTrip, closeLeave: true }, activeUser);

    expect(movementsService.closeAt).toHaveBeenCalledWith(
      'mov-1',
      '2026-08-09',
      activeUser,
    );
    expect(alertsService.createFromLeaveAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'emp-1', closed: true }),
    );
    expect(tripsRepo.save).toHaveBeenCalled();
  });

  it('no cierra una licencia que arranca el mismo día del viaje', async () => {
    employmentIs({
      status: EmploymentStatus.ON_LEAVE,
      movement: {
        id: 'mov-1',
        type: EmploymentMovementType.LEAVE,
        startDate: '2026-08-10',
        endDate: null,
      },
    });

    await expect(
      service.create({ ...baseTrip, closeLeave: true }, activeUser),
    ).rejects.toThrow(/eliminala desde RRHH/);
    expect(movementsService.closeAt).not.toHaveBeenCalled();
  });

  it('permite el viaje posterior a la licencia, pero deja una alerta', async () => {
    // Activo en la fecha del viaje, de licencia hoy.
    employmentIs(
      { status: EmploymentStatus.ACTIVE },
      {
        status: EmploymentStatus.ON_LEAVE,
        movement: { id: 'mov-1', endDate: '2026-08-05' },
      },
    );

    await service.create({ ...baseTrip }, activeUser);

    expect(tripsRepo.save).toHaveBeenCalled();
    expect(movementsService.closeAt).not.toHaveBeenCalled();
    expect(alertsService.createFromLeaveAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ closed: false, leaveUntil: '2026-08-05' }),
    );
  });

  it('la suspensión bloquea aunque se mande closeLeave', async () => {
    employmentIs({
      status: EmploymentStatus.SUSPENDED,
      movement: { id: 'mov-2', startDate: '2026-08-05', endDate: '2026-08-15' },
    });

    await expect(
      service.create({ ...baseTrip, closeLeave: true }, activeUser),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(movementsService.closeAt).not.toHaveBeenCalled();
    expect(tripsRepo.save).not.toHaveBeenCalled();
  });

  it('la baja bloquea aunque se mande closeLeave', async () => {
    employmentIs({
      status: EmploymentStatus.TERMINATED,
      movement: { id: 'mov-3', startDate: '2026-06-01' },
    });

    await expect(
      service.create({ ...baseTrip, closeLeave: true }, activeUser),
    ).rejects.toThrow(/dado de baja desde el 2026-06-01/);
    expect(tripsRepo.save).not.toHaveBeenCalled();
  });

  it('no persiste closeLeave como campo del viaje', async () => {
    await service.create({ ...baseTrip, closeLeave: true }, activeUser);
    expect(tripsRepo.create.mock.calls[0][0].closeLeave).toBeUndefined();
  });
});
