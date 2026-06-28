import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IndicatorsService } from './indicators.service';
import { IndicatorFilterDto } from './dto/indicator-filter.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';

@ApiTags('Indicators')
@ApiBearerAuth()
@Controller('indicators')
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Get('summary')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  summary(@Query() filter: IndicatorFilterDto) {
    return this.indicatorsService.summary(filter);
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
