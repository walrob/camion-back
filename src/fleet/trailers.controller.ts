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
import { TrailersService } from './trailers.service';
import { CreateTrailerDto } from './dto/create-trailer.dto';
import { UpdateTrailerDto } from './dto/update-trailer.dto';
import { TrailerStatus } from 'src/common/enums/trailerStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { FleetExcelService } from './fleet-excel.service';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('Trailers')
@ApiBearerAuth()
@Controller('trailers')
export class TrailersController {
  constructor(
    private readonly trailersService: TrailersService,
    private readonly fleetExcelService: FleetExcelService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.MANAGER)
  create(
    @Body() dto: CreateTrailerDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.trailersService.create(dto, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TrailerStatus })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: TrailerStatus,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.trailersService.paginate({ page, limit }, search, status);
  }

  // Descarga el listado con los mismos filtros que la tabla, sin paginar.
  // Va antes de @Get(':id'): Nest resuelve por orden de declaracion.
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TrailerStatus })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('status') status?: TrailerStatus,
  ): Promise<StreamableFile> {
    const buffer = await this.fleetExcelService.exportTrailers({
      search,
      status,
    });
    return sendXlsx(res, 'acoplados.xlsx', buffer);
  }

  @Get('import/template')
  @Auth(Role.ADMIN, Role.MANAGER)
  template(@Res({ passthrough: true }) res: Response): StreamableFile {
    return sendXlsx(
      res,
      'plantilla-acoplados.xlsx',
      this.fleetExcelService.trailerTemplate(),
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
    return this.fleetExcelService.importTrailers(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  findOne(@Param('id') id: string) {
    return this.trailersService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTrailerDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.trailersService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.trailersService.remove(id, user);
  }
}
