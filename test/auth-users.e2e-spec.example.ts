// Ejemplos de tests para el sistema de autenticación

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { Role } from '../src/common/enums/role.enum';

describe('Auth & Users (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let usersService: UsersService;
  let adminToken: string;
  let operatorToken: string;
  let clientToken: string;
  let adminId: string;
  let operatorId: string;
  let clientId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      // imports: [AppModule], // Importar el módulo principal
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    usersService = moduleFixture.get<UsersService>(UsersService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('AUTH - REGISTRO Y LOGIN', () => {
    it('should register a new client user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Cliente Test',
          email: 'cliente@test.com',
          password: 'ClientPass123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', 'cliente@test.com');
      clientId = response.body.id;
    });

    it('should fail registration with existing email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Duplicate Test',
          email: 'cliente@test.com',
          password: 'ClientPass123',
        })
        .expect(400); // UnauthorizedException
    });

    it('should fail registration with weak password', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'weak', // No cumple requisitos
        })
        .expect(400); // BadRequestException
    });

    it('should login successfully', async () => {
      // Primero crear un usuario con email verificado
      await usersService.create({
        name: 'Admin Test',
        email: 'admin@test.com',
        password: 'AdminPass123', // Hasheado en servicio
        isEmailVerified: true,
        role: Role.ADMIN,
      });

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'AdminPass123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('role', Role.ADMIN);

      adminToken = response.body.token;
      adminId = response.body.user.id;
    });

    it('should fail login with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'WrongPassword123',
        })
        .expect(401); // UnauthorizedException
    });

    it('should fail login with unverified email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'cliente@test.com', // Email no verificado
          password: 'ClientPass123',
        })
        .expect(401); // UnauthorizedException
    });
  });

  describe('AUTH - CREAR OPERADOR (Admin only)', () => {
    it('should create operator as admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/create-operator')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Operador Test',
          email: 'operador@test.com',
          password: 'OperatorPass123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('role', Role.OPERATOR);
      expect(response.body).toHaveProperty('message');
      operatorId = response.body.id;
    });

    it('should fail to create operator without admin token', async () => {
      await request(app.getHttpServer())
        .post('/auth/create-operator')
        .send({
          name: 'Invalid Operator',
          email: 'invalid@test.com',
          password: 'InvalidPass123',
        })
        .expect(401); // UnauthorizedException
    });

    it('should fail to create operator as non-admin', async () => {
      // Crear token de cliente
      const clientUser = await usersService.create({
        name: 'Regular User',
        email: 'regular@test.com',
        password: 'RegularPass123',
        isEmailVerified: true,
        role: Role.USER,
      });

      // Mock: obtener token del cliente
      const clientTokenResponse = await authService.validateUser({
        email: 'regular@test.com',
        password: 'RegularPass123',
      });

      await request(app.getHttpServer())
        .post('/auth/create-operator')
        .set('Authorization', `Bearer ${clientTokenResponse.token}`)
        .send({
          name: 'Unauthorized Operator',
          email: 'unauth@test.com',
          password: 'UnAuthPass123',
        })
        .expect(403); // Forbidden (RolesGuard)
    });

    it('should fail to create operator with existing email', async () => {
      await request(app.getHttpServer())
        .post('/auth/create-operator')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Operator',
          email: 'operador@test.com', // Ya existe
          password: 'DuplicatePass123',
        })
        .expect(409); // ConflictException
    });
  });

  describe('USERS - LISTAR Y FILTRAR', () => {
    it('should get all users with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('pages');
    });

    it('should filter users by role', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/by-role/${Role.OPERATOR}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      response.body.data.forEach((user) => {
        expect(user.role).toBe(Role.OPERATOR);
      });
    });

    it('should fail to list users without admin role', async () => {
      const clientTokenResponse = await authService.validateUser({
        email: 'regular@test.com',
        password: 'RegularPass123',
      });

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${clientTokenResponse.token}`)
        .expect(403); // Forbidden
    });

    it('should get user by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${operatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', operatorId);
      expect(response.body).toHaveProperty('role', Role.OPERATOR);
      expect(response.body).not.toHaveProperty('password'); // Password no debe incluirse
    });

    it('should get own profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', adminId);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should fail to get profile without auth', async () => {
      await request(app.getHttpServer()).get('/users/profile').expect(401);
    });
  });

  describe('USERS - GESTIÓN', () => {
    it('should toggle block user', async () => {
      // Verificar estado inicial
      let user = await usersService.findOneById(operatorId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      const initialBlockStatus = user.blocked;

      // Toggle bloqueo
      const response = await request(app.getHttpServer())
        .post(`/users/${operatorId}/toggle-block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('userId', operatorId);
      expect(response.body.blocked).toBe(!initialBlockStatus);

      // Verificar que el usuario no pueda hacer login si está bloqueado
      if (response.body.blocked) {
        // Crear operador login test
        const operatorToken = await authService.validateUser({
          email: 'operador@test.com',
          password: 'OperatorPass123',
        });

        // Este login debería fallar después del siguiente ciclo
        // Aquí solo verificamos que el cambio se reflejó
        user = await usersService.findOneById(operatorId);
        if (user) {
          expect(user.blocked).toBe(true);
        }
      }
    });

    it('should soft delete user', async () => {
      const response = await request(app.getHttpServer())
        .post(`/users/${clientId}/delete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('userId', clientId);
      expect(response.body).toHaveProperty('message');

      // Verificar que el usuario está soft-deleted
      const deletedUser = await usersService.findOneById(clientId);
      expect(deletedUser).toHaveProperty('deletedAt');
    });

    it('should fail to delete non-existent user', async () => {
      const fakeUuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

      await request(app.getHttpServer())
        .post(`/users/${fakeUuid}/delete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404); // NotFoundException
    });
  });

  describe('AUTH - CAMBIOS DE CONTRASEÑA Y TEMA', () => {
    it('should change password', async () => {
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'admin@test.com',
          passwordCurrent: 'AdminPass123',
          passwordNew: 'NewAdminPass456',
        })
        .expect(200);

      // Verificar que el login falla con contraseña anterior
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'AdminPass123', // Contraseña anterior
        })
        .expect(401);

      // Verificar que el login funciona con nueva contraseña
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'NewAdminPass456', // Nueva contraseña
        })
        .expect(200);
    });

    it('should change dark mode theme', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/change-dark')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dark: true })
        .expect(200);

      expect(response.body).toHaveProperty('userId');

      // Verificar cambio
      const user = await usersService.findOneById(adminId);
      if (user) {
        expect(user.isTemplateDark).toBe(true);
      }
    });
  });
});
