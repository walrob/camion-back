import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FleetsService } from './fleets.service';
import { CreateFleetDto } from './dto/create-fleet.dto';
import { UpdateFleetDto } from './dto/update-fleet.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { FleetExcelService } from './fleet-excel.service';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('Fleets')
@ApiBearerAuth()
@Controller('fleets')
export class FleetsController {
  constructor(
    private readonly fleetsService: FleetsService,
    private readonly fleetExcelService: FleetExcelService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateFleetDto, @ActiveUser() user: ActiveUserInterface) {
    return this.fleetsService.create(dto, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  @ApiQuery({ name: 'search', required: false })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.fleetsService.paginate({ page, limit }, search);
  }

  @Get('all')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  findAll() {
    return this.fleetsService.findAll();
  }

  // Descarga el listado con el mismo filtro que la tabla, sin paginar.
  // Va antes de @Get(':id'): Nest resuelve por orden de declaracion.
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  @ApiQuery({ name: 'search', required: false })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.fleetExcelService.exportFleets({ search });
    return sendXlsx(res, 'flotas.xlsx', buffer);
  }

  @Get('import/template')
  @Auth(Role.ADMIN, Role.MANAGER)
  template(@Res({ passthrough: true }) res: Response): StreamableFile {
    return sendXlsx(
      res,
      'plantilla-flotas.xlsx',
      this.fleetExcelService.fleetTemplate(),
    );
  }

  @Post('import')
  @Auth(Role.ADMIN, Role.MANAGER)
  @ExcelImport()
  import(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.fleetExcelService.importFleets(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  findOne(@Param('id') id: string) {
    return this.fleetsService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFleetDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.fleetsService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.fleetsService.remove(id, user);
  }
}
