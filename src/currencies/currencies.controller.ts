import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrenciesService, MONEDAS_CONOCIDAS } from './currencies.service';
import { SaveCurrenciesDto } from './dto/save-currencies.dto';
import { SaveRateDto } from './dto/save-rate.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Currencies')
@ApiBearerAuth()
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  /**
   * Sin roles y **sin gating por plan**: la app del chofer necesita las monedas
   * habilitadas para poder cargar un gasto en la aduana, y quien cruza la
   * frontera necesita que las cuentas cierren sea cual sea su plan
   * (docs/CONFIGURACION.md §10).
   */
  @Get()
  @Auth()
  @ApiOperation({ summary: 'Monedas habilitadas y cuál es la base.' })
  async list() {
    return {
      base: await this.currenciesService.base(),
      currencies: await this.currenciesService.activas(),
      /** Catálogo de la región para el selector de la pantalla de configuración. */
      conocidas: MONEDAS_CONOCIDAS,
    };
  }

  @Put()
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Habilita o desactiva monedas de la empresa.' })
  save(
    @Body() dto: SaveCurrenciesDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.currenciesService.saveCurrencies(dto, user);
  }

  @Get('rates')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiQuery({ name: 'code', required: false })
  rates(@Query('code') code?: string) {
    return this.currenciesService.rates(code);
  }

  @Post('rates')
  @Auth(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary:
      'Carga la cotización de un día. No recalcula lo ya convertido; destraba lo pendiente.',
  })
  saveRate(@Body() dto: SaveRateDto, @ActiveUser() user: ActiveUserInterface) {
    return this.currenciesService.saveRate(dto, user);
  }
}
