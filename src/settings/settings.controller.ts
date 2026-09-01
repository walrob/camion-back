import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Auth, AuthFeature } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Sin roles: lo lee cualquiera con sesión, **incluido el chofer**. La app del
   * chofer necesita saber si el checklist es obligatorio o si el odómetro es
   * requerido para pedirlo antes de que se corte la señal. Son reglas de
   * operación, no datos sensibles.
   */
  @Get()
  @Auth()
  @ApiOperation({
    summary: 'Ajustes efectivos de la empresa (default del código + override).',
  })
  describe() {
    return this.settingsService.describe();
  }

  /**
   * Sólo `admin` y desde el plan Operación: estos ajustes cambian lo que el
   * sistema le exige a toda la operación. El gerente los ve, no los toca; una
   * empresa en Control los ve, y opera con los valores por defecto.
   *
   * El gating va en la escritura y no en la lectura a propósito: saber qué se
   * te va a exigir no puede depender del plan.
   */
  @Patch()
  @AuthFeature(Feature.SETTINGS, Role.ADMIN)
  @ApiOperation({ summary: 'Guarda los ajustes que cambiaron. Auditado.' })
  update(
    @Body() dto: UpdateSettingsDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.settingsService.update(dto.values, user);
  }
}
