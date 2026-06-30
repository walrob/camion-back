import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmployeesService } from './employees.service';
import { Employee } from './entities/employee.entity';
import { UsersService } from 'src/users/users.service';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { Role } from 'src/common/enums/role.enum';

const activeUser = { id: 'admin-1', role: 'admin' };

describe('EmployeesService.create (alta con cuenta opcional)', () => {
  let service: EmployeesService;
  let employeesRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let usersService: { findOneByEmail: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    employeesRepo = {
      findOne: jest.fn().mockResolvedValue(null), // documento disponible
      create: jest.fn().mockImplementation((e) => e),
      save: jest.fn().mockImplementation(async (e) => ({ id: 'emp-1', ...e })),
    };
    usersService = {
      findOneByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'user-9' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: getRepositoryToken(Employee), useValue: employeesRepo },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(EmployeesService);
  });

  const base = {
    firstName: 'Juan',
    lastName: 'Gómez',
    documentId: '30123456',
  };

  it('crea la cuenta con el rol derivado del puesto (mecánico → maintenance)', async () => {
    const saved = await service.create(
      {
        ...base,
        position: EmployeePosition.MECHANIC,
        email: 'juan@flota.com',
        password: 'secreto1',
      },
      activeUser,
    );

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'juan@flota.com',
        name: 'Juan Gómez',
        role: Role.MAINTENANCE,
      }),
    );
    expect(saved.userId).toBe('user-9');
    // No se debe persistir password/role/email como datos del legajo.
    const persisted = employeesRepo.save.mock.calls[0][0];
    expect(persisted.password).toBeUndefined();
    expect(persisted.role).toBeUndefined();
    expect(persisted.email).toBeUndefined();
  });

  it('permite sobreescribir el rol explícitamente', async () => {
    await service.create(
      {
        ...base,
        position: EmployeePosition.OTHER,
        email: 'ana@flota.com',
        password: 'secreto1',
        role: Role.HR,
      },
      activeUser,
    );
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.HR }),
    );
  });

  it('rechaza email sin contraseña', async () => {
    await expect(
      service.create({ ...base, email: 'x@flota.com' }, activeUser),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('rechaza email ya usado por otro usuario', async () => {
    usersService.findOneByEmail.mockResolvedValue({ id: 'otro' });
    await expect(
      service.create(
        { ...base, email: 'dup@flota.com', password: 'secreto1' },
        activeUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('vincula un userId existente sin crear cuenta', async () => {
    const saved = await service.create(
      { ...base, userId: 'user-existente' },
      activeUser,
    );
    expect(usersService.create).not.toHaveBeenCalled();
    expect(saved.userId).toBe('user-existente');
  });

  it('crea el legajo sin cuenta cuando no se pasan credenciales', async () => {
    const saved = await service.create({ ...base }, activeUser);
    expect(usersService.create).not.toHaveBeenCalled();
    expect(saved.userId).toBeUndefined();
  });
});
