import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/**
 * Duración del token de impersonación.
 *
 * Corta a propósito: es una sesión de soporte, no un acceso permanente. Si hace
 * falta más tiempo, se vuelve a pedir y queda otro registro de auditoría.
 */
const MINUTOS_DE_VIDA = 30;

/**
 * Entrar a la cuenta de un cliente para dar soporte.
 *
 * Es la funcionalidad más útil de soporte y la más peligrosa del sistema: quien
 * la usa ve datos reales de un cliente. Por eso tiene tres candados:
 *
 *  1. **Solo lectura**: el token lleva `impersonating: true` y
 *     `ImpersonationReadOnlyGuard` rechaza toda escritura. Nadie puede cargar ni
 *     borrar nada "en nombre de" un cliente.
 *  2. **Vida corta**: 30 minutos.
 *  3. **Auditado**: cada inicio queda registrado con actor, empresa y motivo.
 *
 * El front, además, muestra una barra permanente: quien está adentro tiene que
 * saberlo en todo momento.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Emite un token de solo lectura sobre la empresa indicada.
   *
   * Se usa el usuario administrador de la empresa como identidad, para que el
   * cliente vea exactamente lo que ve su administrador.
   */
  async impersonar(
    companyId: string,
    superadminId: string,
  ): Promise<{
    token: string;
    expiresAt: Date;
    company: { id: string; name: string };
    comoUsuario: string;
  }> {
    return runAsSystem(async () => {
      const company = await this.companiesRepository.findOne({
        where: { id: companyId },
      });
      if (!company) throw new NotFoundException('Empresa no encontrada.');

      const admin = await this.usersRepository.findOne({
        where: { companyId, role: 'admin' as never },
        order: { createdAt: 'ASC' },
      });
      if (!admin) {
        throw new BadRequestException(
          'La empresa no tiene un usuario administrador al que suplantar.',
        );
      }

      const payload = {
        id: admin.id,
        companyId,
        role: admin.role,
        status: company.status,
        // Lo que después leen el guard de solo lectura y el banner del front.
        impersonating: true,
        impersonatedBy: superadminId,
      };

      const token = await this.jwtService.signAsync(payload, {
        expiresIn: `${MINUTOS_DE_VIDA}m`,
      });

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + MINUTOS_DE_VIDA);

      return {
        token,
        expiresAt,
        company: { id: company.id, name: company.name },
        comoUsuario: admin.email,
      };
    });
  }
}
