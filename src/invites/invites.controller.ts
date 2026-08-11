import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@ApiTags('Invitaciones')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  // ── Rutas públicas: las usa quien todavía no tiene cuenta ─────────────────

  /**
   * Datos de la invitación para la pantalla de aceptación.
   * Limitada por IP: el token es la credencial y no conviene dejar probarlo.
   */
  @Get('token/:token')
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @ApiOperation({ summary: 'Datos públicos de una invitación.' })
  ver(@Param('token') token: string) {
    return this.invitesService.ver(token);
  }

  @Post('token/:token/accept')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Acepta la invitación y crea el usuario en la empresa correcta.',
  })
  aceptar(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.invitesService.aceptar(token, dto);
  }

  // ── Rutas de la empresa ──────────────────────────────────────────────────

  @Post()
  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary:
      'Invita a alguien a la empresa. Los choferes se suman por acá: es lo ' +
      'que hace que sean ilimitados sin trabajo administrativo.',
  })
  invitar(
    @Body() dto: CreateInviteDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.invitesService.invitar(user.companyId, dto, user.id);
  }

  @Get()
  @ApiBearerAuth()
  @Auth(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Invitaciones pendientes de la empresa.' })
  pendientes(@ActiveUser() user: ActiveUserInterface) {
    return this.invitesService.pendientes(user.companyId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Cancela una invitación pendiente.' })
  cancelar(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.invitesService.cancelar(user.companyId, id);
  }
}
