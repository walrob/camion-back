import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_DEMO_KEY } from '../decorators/allow-demo.decorator';

/** Métodos HTTP que solo leen: siempre permitidos (incluye descarga de PDFs). */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Mensaje único de rechazo, compartido con los chequeos manuales de `isDemo`. */
export const DEMO_READONLY_MESSAGE =
  'Cuenta demo de solo lectura: no está permitido modificar datos.';

/**
 * Bloquea las escrituras para las cuentas demo (solo lectura). Se encadena en el
 * decorator `@Auth()` después del `AuthGuard`, así `request.user` ya está cargado
 * desde el JWT. Un endpoint puntual puede permitirse con `@AllowDemo()`.
 */
@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { isDemo?: boolean } | undefined;

    // Solo aplica a cuentas demo; el resto pasa sin cambios.
    if (!user?.isDemo) return true;

    // La lectura siempre está permitida (los PDFs se sirven/generan vía GET).
    if (READ_ONLY_METHODS.has(request.method)) return true;

    // Escape hatch explícito por endpoint.
    const allowDemo = this.reflector.getAllAndOverride<boolean>(ALLOW_DEMO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowDemo) return true;

    throw new ForbiddenException(DEMO_READONLY_MESSAGE);
  }
}
