import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin roles declarados (@Auth() sin argumentos) => cualquier usuario autenticado.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // El superadmin opera la plataforma: pasa siempre.
    if (user.role === Role.SUPERADMIN) return true;

    // El ADMIN es el rol máximo DE SU EMPRESA, y por eso pasa cualquier control
    // de rol... salvo los que exigen SUPERADMIN, que es un rol de plataforma y
    // está por encima de él.
    //
    // Sin esta excepción, el atajo convertía a todo administrador de cliente en
    // operador de la plataforma: podía ver y modificar las demás empresas.
    const exigeSuperadmin = requiredRoles.includes(Role.SUPERADMIN);
    if (user.role === Role.ADMIN && !exigeSuperadmin) return true;

    return requiredRoles.includes(user.role);
  }
}
