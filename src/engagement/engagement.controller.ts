import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/decorators/public.decorator';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { Role } from 'src/common/enums/role.enum';
import { EngagementService } from './engagement.service';
import { SendEngagementTestDto, UpdateOptOutDto } from './dto/engagement.dto';

/**
 * Lo que se abre desde los emails, sin sesión: el clic del botón y el link de
 * baja. Lo que identifica a la persona es el id del log o el token firmado.
 */
@ApiTags('Engagement')
@Public()
@Controller('engagement')
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  /** Botón del email: registra el clic y redirige al destino guardado. */
  @Get('c/:id')
  @Redirect()
  async click(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      url: await this.engagementService.registerClick(id),
      statusCode: 302,
    };
  }

  /**
   * Baja en un clic (RFC 8058): la manda el cliente de correo —Gmail,
   * Outlook— desde su propio botón, sin pasar por nuestra página.
   */
  @Post('unsubscribe/one-click')
  @HttpCode(200)
  @ApiQuery({ name: 't', required: true })
  async oneClick(@Query('t') token: string) {
    await this.engagementService.setOptOut(token, true);
    return { ok: true };
  }

  /** Página de baja del front: muestra el estado. */
  @Get('unsubscribe')
  @ApiQuery({ name: 't', required: true })
  getOptOut(@Query('t') token: string) {
    return this.engagementService.getOptOut(token);
  }

  /**
   * La baja se confirma con un botón y no al abrir el link: los antivirus de
   * correo abren los links para revisarlos y darían de baja a cualquiera.
   */
  @Patch('unsubscribe')
  setOptOut(@Body() dto: UpdateOptOutDto) {
    return this.engagementService.setOptOut(dto.t, dto.optOut);
  }
}

/** Métricas, vista previa y envío de prueba, para el panel del superadmin. */
@ApiTags('Engagement')
@ApiBearerAuth()
@Auth(Role.SUPERADMIN)
@Controller('superadmin/engagement')
export class EngagementAdminController {
  constructor(private readonly engagementService: EngagementService) {}

  @Get('metrics')
  @ApiQuery({ name: 'days', required: false, type: Number })
  getMetrics(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.engagementService.getMetrics(Math.min(Math.max(days, 1), 365));
  }

  /**
   * A quién le saldría qué si el cron corriera ahora, sin mandar nada. Ignora
   * el horario laboral y los interruptores: sirve para revisar antes de prender
   * el envío.
   */
  @Get('preview')
  preview() {
    return this.engagementService.plan(new Date());
  }

  /** Manda un paso a la casilla de quien lo pide, para ver cómo se ve. */
  @Post('test')
  sendTest(
    @Body() dto: SendEngagementTestDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.engagementService.sendTest(user.id, dto.segment, dto.step);
  }
}
