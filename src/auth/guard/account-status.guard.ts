import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';

/** Métodos que no modifican nada. */
const SOLO_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rutas que siguen disponibles con la cuenta bloqueada.
 *
 * Son las que permiten **salir** del bloqueo: ver el estado del plan, la
 * facturación pendiente y cerrar sesión. Dejar a alguien bloqueado sin manera de
 * pagar es la forma más segura de perderlo en vez de cobrarle.
 */
const LISTA_BLANCA = [
  '/api/v1/auth',
  '/api/v1/billing',
  '/api/v1/companies/me',
];

/**
 * Corta el acceso según el estado comercial de la empresa (decisión D6).
 *
 * | Estado      | Acceso                                          |
 * |-------------|-------------------------------------------------|
 * | `TRIAL`     | Completo                                        |
 * | `ACTIVE`    | Completo                                        |
 * | `DEFAULTER` | Completo (el front muestra el aviso de deuda)   |
 * | `BLOCKED`   | **Sólo lectura**, más la lista blanca           |
 * | `CANCELLED` | Sin acceso                                      |
 *
 * El estado se lee de la base y no del token: el JWT dura un día y dejaría a una
 * empresa bloqueada operando hasta que expire, o a una que acaba de pagar sin
 * poder trabajar.
 */
@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Sin usuario todavía no hay empresa: lo resuelve AuthGuard.
    if (!user?.companyId) return true;

    const company = await this.companiesRepository.findOne({
      where: { id: user.companyId },
      select: { id: true, status: true },
    });
    if (!company) return true;

    switch (company.status) {
      case CompanyStatus.TRIAL:
      case CompanyStatus.ACTIVE:
      case CompanyStatus.DEFAULTER:
        return true;

      case CompanyStatus.CANCELLED:
        throw new ForbiddenException({
          message:
            'La cuenta está dada de baja. Escribinos si querés reactivarla.',
          error: 'ACCOUNT_CANCELLED',
        });

      case CompanyStatus.BLOCKED: {
        const url: string = request.originalUrl ?? request.url ?? '';
        const enListaBlanca = LISTA_BLANCA.some((p) => url.startsWith(p));
        if (enListaBlanca) return true;

        if (SOLO_LECTURA.has(request.method)) return true;

        throw new ForbiddenException({
          message:
            'Tu cuenta está suspendida por falta de pago. Podés seguir ' +
            'consultando la información, pero no cargar novedades hasta ' +
            'regularizar.',
          error: 'ACCOUNT_BLOCKED',
        });
      }

      default:
        return true;
    }
  }
}
