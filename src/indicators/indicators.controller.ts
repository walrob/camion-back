import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IndicatorsService } from './indicators.service';
import { IndicatorFilterDto } from './dto/indicator-filter.dto';
import { ExpenseGroupFilterDto } from './dto/expense-group-filter.dto';
import { SeriesFilterDto } from './dto/series-filter.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';

@ApiTags('Indicators')
@ApiBearerAuth()
@RequiresFeature(Feature.INDICATORS)
@Controller('indicators')
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Get('summary')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  summary(@Query() filter: IndicatorFilterDto) {
    return this.indicatorsService.summary(filter);
  }

  // Detalle completo de gastos por camión/chofer (para el modal "Ver todos").
  @Get('expenses')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  expenses(@Query() filter: ExpenseGroupFilterDto) {
    return this.indicatorsService.expensesByGroup(filter, filter.group);
  }

  @Get('series')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Evolución del gasto, la distancia, el costo por km y el consumo.',
    description:
      'Devuelve `points` con un punto por bucket (día/semana/mes, elegido según ' +
      'la ventana si no se envía `bucket`), incluidos los buckets sin datos. ' +
      '`costPerKm` y `fuelEfficiency` van en null cuando el bucket no tuvo km.',
  })
  series(@Query() filter: SeriesFilterDto) {
    return this.indicatorsService.series(filter);
  }

  @Get('by-type')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Composición del gasto por rubro a lo largo del período.',
    description:
      'Formato listo para barra apilada: `periods` (eje X) y `series` con una ' +
      'entrada por tipo de gasto, ordenadas de mayor a menor peso en el período.',
  })
  byType(@Query() filter: SeriesFilterDto) {
    return this.indicatorsService.expensesByType(filter);
  }

  @Get('efficiency')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Costo por km y rendimiento por camión.',
    description:
      'Ranking normalizado por kilómetro —comparable entre unidades, a ' +
      'diferencia del gasto absoluto— con km y viajes como contexto.',
  })
  efficiency(@Query() filter: IndicatorFilterDto) {
    return this.indicatorsService.efficiencyByTruck(filter);
  }

  @Get('routes')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Costo por km por clasificación de ruta.',
    description:
      'Agrupa por `trip.classification` (catálogo `trip_classification`). La ' +
      'clave null son los viajes sin clasificar.',
  })
  routes(@Query() filter: IndicatorFilterDto) {
    return this.indicatorsService.byRoute(filter);
  }

  @Get('export')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  async export(
    @Query() filter: IndicatorFilterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.indicatorsService.exportXlsx(filter);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="indicadores.xlsx"',
    });
    return new StreamableFile(buffer);
  }
}
