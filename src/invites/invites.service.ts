import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as bcryptjs from 'bcryptjs';
import { Invite } from './entities/invite.entity';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LimitsService } from 'src/plans/limits.service';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/** Días de validez de una invitación. */
const DIAS_DE_VALIDEZ = 7;

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    @InjectRepository(Invite)
    private readonly invitesRepository: Repository<Invite>,
    private readonly limitsService: LimitsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crea una invitación para sumarse a la empresa del usuario que invita.
   *
   * El rol se valida contra el plan: no tiene sentido invitar a un auditor si el
   * plan no incluye ese rol, y descubrirlo recién al aceptar sería peor.
   */
  async invitar(
    companyId: string,
    dto: CreateInviteDto,
    invitadoPor?: string,
  ): Promise<{ token: string; expiresAt: Date; email: string }> {
    const email = dto.email.toLowerCase();

    await this.limitsService.assertRolPermitido(companyId, dto.role);

    // El email es único global (decisión D1): si ya hay cuenta, no se invita.
    const yaTieneCuenta = await runAsSystem(() =>
      this.dataSource.getRepository(User).findOne({ where: { email } }),
    );
    if (yaTieneCuenta) {
      throw new ConflictException(
        'Ya existe una cuenta con ese email. Pedile que inicie sesión.',
      );
    }

    // Una invitación pendiente para el mismo email se reemplaza en lugar de
    // acumularse: si alguien invita dos veces, el link viejo deja de servir.
    const pendiente = await this.invitesRepository.findOne({
      where: { companyId, email, acceptedAt: IsNull() },
    });
    if (pendiente) {
      await this.invitesRepository.softDelete(pendiente.id);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DIAS_DE_VALIDEZ);

    const invite = await this.invitesRepository.save(
      this.invitesRepository.create({
        companyId,
        token: randomUUID(),
        email,
        name: dto.name,
        role: dto.role,
        expiresAt,
        createdBy: invitadoPor,
      }),
    );

    // TODO (fase 9): enviar el mail con el link. Por ahora el token se devuelve
    // para que el front lo muestre y se pueda compartir a mano.
    this.logger.log(`Invitación creada para ${email} (${dto.role}).`);

    return { token: invite.token, expiresAt, email };
  }

  /**
   * Datos públicos de una invitación, para que la pantalla de aceptación pueda
   * mostrar a qué empresa lo invitan antes de pedirle la contraseña.
   *
   * Distingue los motivos de rechazo —inexistente, vencida, ya usada— en lugar
   * de devolver un error genérico: un invitado que ve "token inválido" no sabe
   * si equivocó el link o si tiene que pedir otro.
   */
  async ver(token: string): Promise<{
    email: string;
    name: string | null;
    role: string;
    companyName: string;
    expiresAt: Date;
  }> {
    const invite = await this.buscarValida(token);

    const company = await runAsSystem(() =>
      this.dataSource
        .getRepository(Company)
        .findOne({ where: { id: invite.companyId } }),
    );

    return {
      email: invite.email,
      name: invite.name ?? null,
      role: invite.role,
      companyName: company?.name ?? '',
      expiresAt: invite.expiresAt,
    };
  }

  /** Acepta la invitación y crea el usuario dentro de la empresa correcta. */
  async aceptar(
    token: string,
    dto: AcceptInviteDto,
  ): Promise<{ email: string; companyId: string }> {
    return runAsSystem(async () => {
      const invite = await this.buscarValida(token);

      const email = invite.email;
      const yaTieneCuenta = await this.dataSource
        .getRepository(User)
        .findOne({ where: { email } });
      if (yaTieneCuenta) {
        throw new ConflictException(
          'Ya existe una cuenta con ese email. Iniciá sesión.',
        );
      }

      // El plan pudo haber cambiado entre la invitación y la aceptación.
      await this.limitsService.assertRolPermitido(invite.companyId, invite.role);

      return this.dataSource.transaction(async (manager) => {
        const user = await manager.getRepository(User).save(
          manager.getRepository(User).create({
            companyId: invite.companyId,
            email,
            name: dto.name ?? invite.name ?? email,
            password: await bcryptjs.hash(dto.password, 10),
            role: invite.role,
          } as Partial<User>),
        );

        await manager.getRepository(Invite).update(invite.id, {
          acceptedAt: new Date(),
          acceptedUserId: user.id,
        });

        return { email, companyId: invite.companyId };
      });
    });
  }

  /**
   * Busca una invitación utilizable. Se consulta en contexto de sistema porque
   * quien la usa todavía no está autenticado y no tiene empresa.
   */
  private async buscarValida(token: string): Promise<Invite> {
    const invite = await runAsSystem(() =>
      this.invitesRepository.findOne({ where: { token } }),
    );

    if (!invite) {
      throw new NotFoundException(
        'La invitación no existe. Verificá el link o pedí que te la envíen de nuevo.',
      );
    }
    if (invite.acceptedAt) {
      throw new BadRequestException(
        'Esta invitación ya fue usada. Iniciá sesión con tu cuenta.',
      );
    }
    if (new Date(invite.expiresAt) < new Date()) {
      throw new BadRequestException(
        'La invitación venció. Pedile a la empresa que te envíe una nueva.',
      );
    }

    return invite;
  }

  /** Invitaciones pendientes de la empresa. */
  pendientes(companyId: string): Promise<Invite[]> {
    return this.invitesRepository.find({
      where: { companyId, acceptedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /** Cancela una invitación que todavía no se usó. */
  async cancelar(companyId: string, id: string): Promise<{ id: string }> {
    const invite = await this.invitesRepository.findOne({
      where: { id, companyId },
    });
    if (!invite) throw new NotFoundException('Invitación no encontrada.');
    if (invite.acceptedAt) {
      throw new BadRequestException('La invitación ya fue aceptada.');
    }

    await this.invitesRepository.softDelete(id);
    return { id };
  }
}
