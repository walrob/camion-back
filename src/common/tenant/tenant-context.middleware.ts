import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { runWithTenantContext } from './tenant-context';

/**
 * Abre el contexto de empresa para todo el manejo del request.
 *
 * Se aplica a TODAS las rutas a propósito: si sólo se aplicara a las
 * autenticadas, una ruta nueva que se olvide de registrar quedaría sin contexto
 * y el filtrado por empresa no se aplicaría.
 *
 * El store nace vacío; lo completa `AuthGuard` cuando valida el token.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    runWithTenantContext(() => next());
  }
}
