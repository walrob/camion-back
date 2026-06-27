import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcryptjs from 'bcryptjs';
import { UsersService } from 'src/users/users.service';
import { Role } from 'src/common/enums/role.enum';
import { PasswordDto } from './dto/password.dto';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { LoginDto } from './dto/login.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser({ email, password }: LoginDto) {
    const user = await this.usersService.findOneByEmailWithPassword(email);

    if (!user) throw new UnauthorizedException('Email inválido.');
    if (user.blocked) throw new UnauthorizedException('Usuario bloqueado.');

    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Contraseña inválida.');

    await this.usersService.update(user.id, { lastConnection: new Date() } as any);

    const payload = { id: user.id, role: user.role };
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
      },
    };
  }

  async changePassword({ email, passwordCurrent, passwordNew }: PasswordDto) {
    const userBd = await this.usersService.findOneByEmailWithPassword(email);
    if (!userBd) throw new BadRequestException('No existe usuario.');

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

      await this.usersService.update(user.id, {
        password: await bcryptjs.hash(passwordNew, 10),
      } as any);

      return { message: 'Contraseña actualizada correctamente' };
    } catch {
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

    const newUser = await this.usersService.create({
      email: createOperatorDto.email,
      name: createOperatorDto.name,
      password: await bcryptjs.hash(createOperatorDto.password, 10),
      isEmailVerified: true,
      role: createOperatorDto.role ?? Role.DRIVER,
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
