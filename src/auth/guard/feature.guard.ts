import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Feature } from 'src/common/enums/feature.enum';
import { Role } from 'src/common/enums/role.enum';
import { PlanContextService } from 'src/plans/plan-context.service';
import { FEATURE_KEY } from '../decorators/requires-feature.decorator';

/**
 * Rechaza los endpoints que el plan de la empresa no incluye.
 *
 * Esto es el gating **real**: lo del front es experiencia de usuario. Un cliente
 * en plan Control no debe poder consultar rendiciones aunque manipule el store
 * del navegador (MODELO-COMERCIAL §12).
 *
 * A diferencia del rol, acá **el ADMIN no tiene privilegio**: el plan es un
 * límite comercial de la empresa, no un permiso del usuario. Un administrador de
 * una empresa en Control sigue sin tener rendiciones.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planContext: PlanContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<Feature>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Endpoint sin feature declarada: no lo limita el plan.
    if (!feature) return true;

    const { user } = context.switchToHttp().getRequest();

    // El superadmin opera sobre la plataforma, no dentro de un plan.
    if (user?.role === Role.SUPERADMIN) return true;

    if (!user?.companyId) {
      throw new ForbiddenException('Sin empresa en la sesión.');
    }

    const contexto = await this.planContext.obtener(user.companyId);
    if (contexto?.features.includes(feature)) return true;

    // El mensaje nombra el plan actual para que el front pueda ofrecer el
    // upgrade correcto en vez de mostrar un 403 sin explicación.
    throw new ForbiddenException({
      message:
        'Esta funcionalidad no está incluida en tu plan. ' +
        'Actualizá el plan para habilitarla.',
      error: 'FEATURE_NOT_IN_PLAN',
      feature,
      currentPlan: contexto?.planCode ?? null,
    });
  }
}
