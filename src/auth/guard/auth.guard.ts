import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import {
  calcularCorteRetencion,
  setRetentionCutoff,
  setTenantContext,
} from 'src/common/tenant/tenant-context';
import { PlanContextService } from 'src/plans/plan-context.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly planContext: PlanContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = payload;

      // Momento en que el token verificado se convierte en aislamiento: a
      // partir de acá todos los repositorios filtran por esta empresa sin que
      // los servicios tengan que hacer nada.
      if (payload?.companyId) {
        setTenantContext(payload.companyId, payload.id);

        // El corte de retención se resuelve una vez por request y viaja en el
        // contexto: el query builder se arma de forma sincrónica y no puede
        // esperar una consulta del plan en el momento de filtrar.
        // El plan sale de la caché de 60s, así que no es un SELECT por request.
        const plan = await this.planContext.obtener(payload.companyId);
        setRetentionCutoff(
          calcularCorteRetencion(plan?.limits?.retentionMonths),
        );
      }
    } catch (error) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private extractTokenFromHeader(request: Request) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
