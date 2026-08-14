import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
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
import { EmailService } from 'src/notifications/email/email.service';

/**
 * Motivo de rechazo del login cuando falta confirmar la casilla.
 *
 * Es una constante porque el front la compara para decidir si ofrece el botón
 * de reenvío: un `includes` sobre un texto suelto se rompe en silencio la
 * primera vez que alguien corrige una coma.
 */
export const EMAIL_SIN_VERIFICAR =
  'Falta confirmar tu correo. Revisá tu casilla —también el correo no deseado— ' +
  'o pedí que te reenviemos el mensaje.';

/** Cuántas horas vale el link de confirmación. */
const HORAS_DE_VERIFICACION = 24;

/**
 * Marca del token de confirmación.
 *
 * Sin ella, un token de sesión cualquiera pasaría por token de verificación:
 * los firma la misma clave y ambos llevan `sub`.
 */
const PROPOSITO_VERIFICACION = 'verify-email';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly planContext: PlanContextService,
    private readonly limitsService: LimitsService,
    private readonly email: EmailService,
  ) {}

  // ── Confirmación de la casilla ───────────────────────────────────────────

  /**
   * Manda (o vuelve a mandar) el mail de confirmación.
   *
   * **Responde igual exista o no la cuenta, y esté o no verificada.** Un
   * endpoint público que distingue los casos es un padrón de direcciones
   * registradas servido gratis a cualquiera.
   */
  async enviarVerificacion(email: string): Promise<{ message: string }> {
    const respuesta = {
      message:
        'Si la dirección corresponde a una cuenta sin confirmar, te enviamos ' +
        'el mensaje.',
    };

    const user = await this.usersService.findOneByEmail(email);
    if (!user || user.emailVerifiedAt) return respuesta;

    const token = this.jwtService.sign(
      { sub: user.id, proposito: PROPOSITO_VERIFICACION },
      { expiresIn: `${HORAS_DE_VERIFICACION}h` },
    );

    try {
      await this.email.sendVerificacionEmail(user.email, {
        token,
        nombre: user.name,
        horas: HORAS_DE_VERIFICACION,
      });
    } catch (e) {
      // El alta ya está hecha: tumbarla porque el SMTP falló obligaría a
      // repetirla y el email quedaría ocupado por la cuenta a medio crear.
      this.logger.error(
        `No se pudo enviar la verificación a ${user.email}: ${String(e)}`,
      );
    }

    return respuesta;
  }

  /**
   * Confirma la casilla a partir del token del mail.
   *
   * El `proposito` del payload no es decorativo: sin él, **el token de sesión
   * de cualquier usuario serviría como token de verificación**, porque los dos
   * los firma la misma clave y los dos llevan un `sub`.
   */
  async verificarEmail(token: string): Promise<{ email: string }> {
    let payload: { sub?: string; proposito?: string };

    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException(
        'El enlace venció o no es válido. Pedí que te lo reenviemos.',
      );
    }

    if (payload.proposito !== PROPOSITO_VERIFICACION || !payload.sub) {
      throw new BadRequestException('El enlace no es válido.');
    }

    const user = await this.usersService.findOneById(payload.sub);
    if (!user) throw new BadRequestException('El enlace no es válido.');

    // Reusar el link no puede ser un error: el cliente de correo que
    // pre-visita los enlaces ya lo consumió una vez antes de que la persona
    // llegue a tocarlo.
    if (!user.emailVerifiedAt) {
      await this.usersService.update(user.id, {
        emailVerifiedAt: new Date(),
      } as never);
    }

    return { email: user.email };
  }

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
        // El middleware del front lo usa para llevar a una empresa nueva por la
        // carga inicial en vez de dejarla frente a un sistema vacío.
        onboardingStep: true,
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

    // La casilla sin confirmar frena el acceso (riesgo R6.1). Se verifica
    // DESPUÉS de la contraseña a propósito: hacerlo antes le contaría a
    // cualquiera qué direcciones tienen cuenta sin verificar.
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(EMAIL_SIN_VERIFICAR);
    }

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
      // Lo crea un administrador y le fija la contraseña: no hay casilla que
      // confirmar, la cuenta ya nace bajo la responsabilidad de la empresa.
      emailVerifiedAt: new Date(),
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
