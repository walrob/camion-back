import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcryptjs from 'bcryptjs';
import { Company } from 'src/companies/entities/company.entity';
import { PlanContextService } from 'src/plans/plan-context.service';
import { UsersService } from 'src/users/users.service';
import { Role } from 'src/common/enums/role.enum';
import { PasswordDto } from './dto/password.dto';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { LoginDto } from './dto/login.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { DEMO_READONLY_MESSAGE } from './guard/demo-readonly.guard';
import { LimitsService } from 'src/plans/limits.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly planContext: PlanContextService,
    private readonly limitsService: LimitsService,
  ) {}

  /**
   * Empresa, plan, features y límites vigentes del usuario.
   *
   * Se resuelve contra la base en cada llamada (con la caché corta de
   * `PlanContextService`), no desde el token: es lo que permite que un cambio de
   * plan se refleje sin que el usuario tenga que volver a entrar.
   */
  async getSession(user: ActiveUserInterface) {
    const company = await this.companiesRepository.findOne({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        trialEndsAt: true,
        logoUrl: true,
        primaryColor: true,
      },
    });

    const plan = await this.planContext.obtener(user.companyId);

    // El consumo de almacenamiento viaja en la sesión para que el front pueda
    // mostrarlo antes de que el cliente choque el tope: un límite que sólo se
    // descubre cuando falla una subida se percibe como una falla del producto.
    const storage = await this.limitsService.estadoStorage(user.companyId);

    return {
      company,
      plan: plan
        ? { code: plan.planCode, name: plan.planName }
        : null,
      features: plan?.features ?? [],
      limits: plan?.limits ?? null,
      storage,
    };
  }

  async validateUser({ email, password }: LoginDto) {
    const user = await this.usersService.findOneByEmailWithPassword(email);

    if (!user) throw new UnauthorizedException('Email inválido.');
    if (user.blocked) throw new UnauthorizedException('Usuario bloqueado.');

    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Contraseña inválida.');

    await this.usersService.update(user.id, { lastConnection: new Date() } as any);

    if (!user.companyId) {
      throw new UnauthorizedException('El usuario no tiene empresa asignada.');
    }

    // `companyId` es lo que después alimenta el contexto de empresa de cada
    // request y, con él, el filtrado de todos los repositorios.
    const payload = {
      id: user.id,
      companyId: user.companyId,
      status: user.company?.status,
      role: user.role,
      isDemo: user.isDemo,
    };
    const token = await this.jwtService.signAsync(payload);
    const decoded = this.jwtService.decode(token) as { exp: number };

    return {
      token,
      expiresAt: new Date(decoded.exp * 1000),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.profileImage,
        isTemplateDark: user.isTemplateDark,
        isDemo: user.isDemo,
      },
    };
  }

  async changePassword({ email, passwordCurrent, passwordNew }: PasswordDto) {
    const userBd = await this.usersService.findOneByEmailWithPassword(email);
    if (!userBd) throw new BadRequestException('No existe usuario.');
    // El endpoint es público y las credenciales demo se comparten: nadie puede
    // cambiarle la contraseña a una cuenta demo y dejarla inutilizable.
    if (userBd.isDemo) throw new ForbiddenException(DEMO_READONLY_MESSAGE);

    const isPasswordValid = await bcryptjs.compare(passwordCurrent, userBd.password);
    if (!isPasswordValid) throw new BadRequestException('Contraseña inválida.');

    await this.usersService.update(userBd.id, {
      password: await bcryptjs.hash(passwordNew, 10),
    } as any);

    return { id: userBd.id, email: userBd.email };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) throw new BadRequestException('Usuario no encontrado.');

    const token = this.jwtService.sign({ sub: user.id }, { expiresIn: '1h' });
    return { message: 'Solicitud registrada. Contacte al administrador.', token };
  }

  async resetPassword(token: string, passwordNew: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findOneById(payload.sub);
      if (!user) throw new BadRequestException('Usuario no encontrado');
      if (user.isDemo) throw new ForbiddenException(DEMO_READONLY_MESSAGE);

      await this.usersService.update(user.id, {
        password: await bcryptjs.hash(passwordNew, 10),
      } as any);

      return { message: 'Contraseña actualizada correctamente' };
    } catch (error) {
      // No enmascarar el rechazo de las cuentas demo como token inválido.
      if (error instanceof ForbiddenException) throw error;
      throw new BadRequestException('Token inválido o expirado');
    }
  }

  async changeDarkUser(userId: string, dark: boolean) {
    const user = await this.usersService.findOneById(userId);
    if (!user) throw new UnauthorizedException('No existe usuario.');
    await this.usersService.update(user.id, { isTemplateDark: dark } as any);
    return { userId: user.id };
  }

  async createUser(createOperatorDto: CreateOperatorDto, adminUser: ActiveUserInterface) {
    if (adminUser.role !== Role.ADMIN) {
      throw new UnauthorizedException('Solo los administradores pueden crear usuarios.');
    }

    const existing = await this.usersService.findOneByEmail(createOperatorDto.email);
    if (existing) throw new ConflictException('Ya existe un usuario con este email.');

    // Los planes chicos no incluyen todos los roles: Control no tiene taller,
    // RRHH ni auditoría (MODELO-COMERCIAL §4.1). Los usuarios siguen siendo
    // ilimitados: lo que limita el plan es QUÉ rol puede tener, no cuántos.
    const rol = createOperatorDto.role ?? Role.DRIVER;
    await this.limitsService.assertRolPermitido(adminUser.companyId, rol);

    const newUser = await this.usersService.create({
      email: createOperatorDto.email,
      name: createOperatorDto.name,
      password: await bcryptjs.hash(createOperatorDto.password, 10),
      isEmailVerified: true,
      role: rol,
    });

    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      message: 'Usuario creado correctamente.',
    };
  }
}
