import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmploymentMovementsService } from './employment-movements.service';
import { EmploymentMovement } from './entities/employment-movement.entity';
import { Employee } from './entities/employee.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { EmploymentMovementType } from 'src/common/enums/employmentMovement.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { TripStatus } from 'src/common/enums/tripStatus.enum';

const activeUser = { id: 'hr-1', role: 'hr' };

/** Arma un movimiento mínimo; `createdAt` desempata los del mismo día. */
const mov = (
  type: EmploymentMovementType,
  startDate: string,
  endDate: string | null = null,
  createdAtMs = 0,
): EmploymentMovement =>
  ({
    type,
    startDate,
    endDate,
    createdAt: new Date(createdAtMs),
  }) as EmploymentMovement;

const { HIRE, LEAVE, SUSPENSION, REINSTATEMENT, TERMINATION } =
  EmploymentMovementType;

describe('EmploymentMovementsService.computeStatus', () => {
  let service: EmploymentMovementsService;
  const asOf = '2026-07-23';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmploymentMovementsService,
        {
          provide: getRepositoryToken(EmploymentMovement),
          useValue: {},
        },
        { provide: getRepositoryToken(Employee), useValue: {} },
        { provide: getRepositoryToken(Driver), useValue: {} },
        { provide: getRepositoryToken(Trip), useValue: {} },
      ],
    }).compile();

    service = module.get(EmploymentMovementsService);
  });

  it('sin movimientos queda activo', () => {
    expect(service.computeStatus([], asOf)).toBe(EmploymentStatus.ACTIVE);
  });

  it('el ingreso deja al empleado activo', () => {
    expect(service.computeStatus([mov(HIRE, '2020-01-15')], asOf)).toBe(
      EmploymentStatus.ACTIVE,
    );
  });

  it('una licencia vigente lo pone en licencia', () => {
    const movements = [
      mov(HIRE, '2020-01-15'),
      mov(LEAVE, '2026-07-20', '2026-08-05'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.ON_LEAVE,
    );
  });

  it('una licencia sin fecha de fin sigue vigente', () => {
    const movements = [mov(HIRE, '2020-01-15'), mov(LEAVE, '2026-07-01')];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.ON_LEAVE,
    );
  });

  it('el último día de la licencia todavía cuenta como vigente', () => {
    const movements = [mov(LEAVE, '2026-07-10', asOf)];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.ON_LEAVE,
    );
  });

  it('una licencia terminada devuelve el empleado a activo', () => {
    const movements = [
      mov(HIRE, '2020-01-15'),
      mov(LEAVE, '2026-06-01', '2026-06-30'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.ACTIVE,
    );
  });

  it('una suspensión vigente pisa a una licencia ya terminada', () => {
    const movements = [
      mov(LEAVE, '2026-05-01', '2026-05-15'),
      mov(SUSPENSION, '2026-07-22', '2026-07-25'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.SUSPENDED,
    );
  });

  it('ignora los movimientos futuros', () => {
    const movements = [
      mov(HIRE, '2020-01-15'),
      mov(LEAVE, '2026-09-01', '2026-09-15'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.ACTIVE,
    );
  });

  it('la baja es terminal', () => {
    const movements = [
      mov(HIRE, '2020-01-15'),
      mov(LEAVE, '2026-01-10', '2026-01-20'),
      mov(TERMINATION, '2026-03-01'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.TERMINATED,
    );
  });

  it('un reingreso posterior a la baja lo reactiva', () => {
    const movements = [
      mov(HIRE, '2019-01-15'),
      mov(TERMINATION, '2023-03-01'),
      mov(HIRE, '2025-02-01'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.ACTIVE,
    );
  });

  it('la reincorporación cierra una suspensión abierta', () => {
    const movements = [
      mov(SUSPENSION, '2026-07-01'),
      mov(REINSTATEMENT, '2026-07-15'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.ACTIVE,
    );
  });

  it('con dos movimientos el mismo día gana el cargado último', () => {
    const movements = [
      mov(REINSTATEMENT, '2026-07-20', null, 1_000),
      mov(SUSPENSION, '2026-07-20', '2026-07-30', 2_000),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.SUSPENDED,
    );
  });

  it('no depende del orden en que vienen de la base', () => {
    const movements = [
      mov(TERMINATION, '2026-03-01'),
      mov(HIRE, '2020-01-15'),
    ];
    expect(service.computeStatus(movements, asOf)).toBe(
      EmploymentStatus.TERMINATED,
    );
  });
});

describe('EmploymentMovementsService.create: viajes sin cerrar', () => {
  let service: EmploymentMovementsService;
  let movementsRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let employeesRepo: { findOne: jest.Mock; save: jest.Mock };
  let driversRepo: { findOne: jest.Mock };
  let tripsRepo: { find: jest.Mock };

  const trip = (over: Partial<Record<string, any>> = {}) => ({
    code: 'V-00012',
    origin: 'Buenos Aires',
    destination: 'Córdoba',
    status: TripStatus.ASSIGNED,
    plannedStartAt: new Date('2026-08-12T06:00:00'),
    plannedEndAt: new Date('2026-08-13T20:00:00'),
    startedAt: null,
    ...over,
  });

  const dto = {
    employeeId: 'emp-1',
    type: LEAVE,
    startDate: '2026-08-10',
    endDate: '2026-08-20',
  };

  beforeEach(async () => {
    movementsRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((m) => m),
      save: jest.fn().mockImplementation(async (m) => ({ id: 'mov-1', ...m })),
    };
    employeesRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'emp-1' }),
      save: jest.fn().mockImplementation(async (e) => e),
    };
    driversRepo = { findOne: jest.fn().mockResolvedValue({ id: 'driver-1' }) };
    tripsRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmploymentMovementsService,
        {
          provide: getRepositoryToken(EmploymentMovement),
          useValue: movementsRepo,
        },
        { provide: getRepositoryToken(Employee), useValue: employeesRepo },
        { provide: getRepositoryToken(Driver), useValue: driversRepo },
        { provide: getRepositoryToken(Trip), useValue: tripsRepo },
      ],
    }).compile();

    service = module.get(EmploymentMovementsService);
  });

  it('carga la licencia si el chofer no tiene viajes abiertos', async () => {
    const saved = await service.create(dto as any, activeUser);
    expect(saved.id).toBe('mov-1');
  });

  it('rechaza la licencia si hay un viaje asignado dentro del período', async () => {
    tripsRepo.find.mockResolvedValue([trip()]);
    await expect(service.create(dto as any, activeUser)).rejects.toThrow(
      /V-00012.*Cancelá o finalizá/s,
    );
    expect(movementsRepo.save).not.toHaveBeenCalled();
  });

  it('detecta el viaje en curso por su fecha real de inicio', async () => {
    tripsRepo.find.mockResolvedValue([
      trip({
        status: TripStatus.IN_PROGRESS,
        plannedStartAt: new Date('2026-07-01T06:00:00'),
        plannedEndAt: null,
        startedAt: new Date('2026-08-11T07:00:00'),
      }),
    ]);
    await expect(service.create(dto as any, activeUser)).rejects.toThrow(
      /en curso/,
    );
  });

  it('ignora los viajes fuera del período', async () => {
    tripsRepo.find.mockResolvedValue([
      trip({
        plannedStartAt: new Date('2026-09-01T06:00:00'),
        plannedEndAt: new Date('2026-09-02T20:00:00'),
      }),
    ]);
    await expect(service.create(dto as any, activeUser)).resolves.toBeDefined();
  });

  it('una licencia sin fecha de fin choca con cualquier viaje posterior', async () => {
    tripsRepo.find.mockResolvedValue([
      trip({
        plannedStartAt: new Date('2027-01-15T06:00:00'),
        plannedEndAt: new Date('2027-01-16T20:00:00'),
      }),
    ]);
    await expect(
      service.create({ ...dto, endDate: undefined } as any, activeUser),
    ).rejects.toThrow(/V-00012/);
  });

  it('la baja también bloquea', async () => {
    tripsRepo.find.mockResolvedValue([trip()]);
    await expect(
      service.create(
        { ...dto, type: TERMINATION, endDate: undefined } as any,
        activeUser,
      ),
    ).rejects.toThrow(/sin cerrar/);
  });

  it('el ingreso no valida viajes', async () => {
    tripsRepo.find.mockResolvedValue([trip()]);
    await expect(
      service.create(
        { ...dto, type: HIRE, endDate: undefined } as any,
        activeUser,
      ),
    ).resolves.toBeDefined();
    expect(tripsRepo.find).not.toHaveBeenCalled();
  });

  it('un empleado que no es chofer no valida viajes', async () => {
    driversRepo.findOne.mockResolvedValue(null);
    tripsRepo.find.mockResolvedValue([trip()]);
    await expect(service.create(dto as any, activeUser)).resolves.toBeDefined();
    expect(tripsRepo.find).not.toHaveBeenCalled();
  });
});
