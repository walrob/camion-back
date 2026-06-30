import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriversService } from './drivers.service';
import { Driver } from './entities/driver.entity';
import { Employee } from 'src/hr/entities/employee.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';

const activeUser = { id: 'user-1', role: 'admin' };

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
});

describe('DriversService', () => {
  let service: DriversService;
  let driversRepo: ReturnType<typeof mockRepo>;
  let employeesRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: getRepositoryToken(Driver), useFactory: mockRepo },
        { provide: getRepositoryToken(Employee), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(DriversService);
    driversRepo = module.get(getRepositoryToken(Driver));
    employeesRepo = module.get(getRepositoryToken(Employee));
  });

  describe('create', () => {
    it('crea el chofer a partir de un employeeId válido', async () => {
      const dto: CreateDriverDto = {
        employeeId: 'emp-1',
        licenseNumber: 'B-123',
        status: DriverStatus.ACTIVE,
      };
      const driverWithEmployee = {
        id: 'drv-1',
        employeeId: 'emp-1',
        licenseNumber: 'B-123',
        employee: { id: 'emp-1', firstName: 'Ana', lastName: 'Pérez' },
      };

      employeesRepo.findOne.mockResolvedValue({ id: 'emp-1' });
      // 1ª llamada: chequeo de duplicado (no existe). 2ª: findOne(saved.id).
      driversRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(driverWithEmployee);
      driversRepo.create.mockImplementation((d) => d);
      driversRepo.save.mockResolvedValue({ id: 'drv-1' });

      const result = await service.create(dto, activeUser);

      expect(employeesRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
      });
      expect(driversRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp-1', createdBy: 'user-1' }),
      );
      expect(result).toBe(driverWithEmployee);
      expect(result.employee.firstName).toBe('Ana');
    });

    it('rechaza un employeeId que ya tiene chofer (1:1)', async () => {
      employeesRepo.findOne.mockResolvedValue({ id: 'emp-1' });
      driversRepo.findOne.mockResolvedValue({ id: 'drv-existente' });

      await expect(
        service.create({ employeeId: 'emp-1' }, activeUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(driversRepo.save).not.toHaveBeenCalled();
    });

    it('rechaza un employeeId inexistente', async () => {
      employeesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ employeeId: 'no-existe' }, activeUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(driversRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('solo toca campos operativos y no datos personales', async () => {
      const existing = {
        id: 'drv-1',
        employeeId: 'emp-1',
        status: DriverStatus.ACTIVE,
        notes: null,
      };
      driversRepo.findOne.mockResolvedValue(existing);
      driversRepo.save.mockResolvedValue(existing);

      const dto: UpdateDriverDto = {
        status: DriverStatus.INACTIVE,
        notes: 'cambió de turno',
      };
      await service.update('drv-1', dto, activeUser);

      const saved = driversRepo.save.mock.calls[0][0];
      expect(saved.status).toBe(DriverStatus.INACTIVE);
      expect(saved.notes).toBe('cambió de turno');
      // El vínculo con el legajo no se reasigna por update.
      expect(saved.employeeId).toBe('emp-1');
    });
  });
});

// Validación a nivel DTO (como lo hace el ValidationPipe del controlador).
describe('Driver DTO validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  it('rechaza el alta sin employeeId', async () => {
    await expect(
      pipe.transform(
        { licenseNumber: 'B-1' },
        { type: 'body', metatype: CreateDriverDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PATCH descarta datos personales (nombre/email)', async () => {
    const result = await pipe.transform(
      {
        status: DriverStatus.INACTIVE,
        notes: 'ok',
        firstName: 'Hackeo',
        name: 'Hackeo',
        email: 'x@y.com',
        employeeId: 'otro-legajo',
      },
      { type: 'body', metatype: UpdateDriverDto },
    );

    expect(result).toEqual({ status: DriverStatus.INACTIVE, notes: 'ok' });
    expect(result.firstName).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.employeeId).toBeUndefined();
  });
});
