import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/** Métodos que sólo leen. */
const SOLO_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

export const IMPERSONATION_READONLY_MESSAGE =
  'Estás viendo la cuenta de un cliente en modo soporte: no se pueden ' +
  'modificar datos. Salí de la suplantación para operar con tu propia cuenta.';

/**
 * Impide escribir mientras se está suplantando a un cliente (riesgo R8.2).
 *
 * Sin esto, la impersonación permitiría cargar, editar o borrar datos **en
 * nombre del cliente**, y el registro de auditoría diría que lo hizo él. Eso
 * arruina la trazabilidad de la que depende el rol Auditor y, ante un reclamo,
 * deja al proveedor sin manera de demostrar qué pasó.
 *
 * No hay excepción posible: a diferencia del modo demo —que tiene `@AllowDemo()`
 * para casos puntuales—, acá **ningún** endpoint puede habilitarse. Si soporte
 * necesita cambiar algo, lo hace desde el panel de superadmin, donde queda
 * registrado a su nombre.
 */
@Injectable()
export class ImpersonationReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { impersonating?: boolean } | undefined;

    if (!user?.impersonating) return true;
    if (SOLO_LECTURA.has(request.method)) return true;

    throw new ForbiddenException({
      message: IMPERSONATION_READONLY_MESSAGE,
      error: 'IMPERSONATION_READ_ONLY',
    });
  }
}
