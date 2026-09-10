import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { sendXlsx } from 'src/common/excel';
import { SettlementStatus } from 'src/common/enums/settlementStatus.enum';
import { ReopenDto } from 'src/common/dto/reopen.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Settlements (Liquidaciones)')
@ApiBearerAuth()
@RequiresFeature(Feature.SETTLEMENTS)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post('trip/:tripId/generate')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  generate(
    @Param('tripId') tripId: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.settlementsService.generate(tripId, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Código del viaje o nombre/apellido del chofer.',
  })
  @ApiQuery({ name: 'status', required: false, enum: SettlementStatus })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: SettlementStatus,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.settlementsService.paginate(
      { page, limit },
      { search, status, driverId, from, to, sortBy, order },
    );
  }

  /**
   * Viajes que se pueden rendir: finalizados y sin liquidación. Va declarada
   * antes de `:id` para que Nest no la tome como un id.
   */
  // Descarga el listado con los mismos filtros que la tabla, sin paginar.
  // Va antes de ':id' para que Nest no la tome como un id.
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: SettlementStatus })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('status') status?: SettlementStatus,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.settlementsService.exportXlsx({
      search,
      status,
      driverId,
      from,
      to,
      sortBy,
      order,
    });
    return sendXlsx(res, 'rendiciones.xlsx', buffer);
  }

  @Get('pending-trips')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  pendingTrips() {
    return this.settlementsService.pendingTrips();
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  findOne(@Param('id') id: string) {
    return this.settlementsService.findOne(id);
  }

  /**
   * Devuelve el comprobante en PDF. Manda el archivo —como la hoja de ruta y
   * la orden de taller— y no una URL firmada de S3: el PDF se rehace con los
   * datos de la liquidación, así que no tiene por qué dejar de salir cuando el
   * bucket no responde.
   */
  @Get(':id/pdf')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  async pdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.settlementsService.pdfBuffer(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post(':id/close')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  close(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.settlementsService.close(id, user);
  }

  /**
   * Reabre una liquidación cerrada para poder recalcularla. Sin el auditor:
   * consulta y cierra, pero no revierte cierres.
   */
  @Post(':id/reopen')
  @Auth(Role.ADMIN, Role.MANAGER)
  reopen(
    @Param('id') id: string,
    @Body() dto: ReopenDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.settlementsService.reopen(id, dto.reason, user);
  }
}
