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
import { DriversService } from './drivers.service';
import { DriversExcelService } from './drivers-excel.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driversExcelService: DriversExcelService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.DISPATCHER)
  create(
    @Body() dto: CreateDriverDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.driversService.create(dto, user);
  }

  // Descarga el listado con los mismos filtros que la tabla, sin paginar.
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.HR)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: DriverStatus })
  @ApiQuery({ name: 'withNews', required: false })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('status') status?: DriverStatus,
    @Query('withNews') withNews?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.driversExcelService.export({
      search,
      status,
      withNews: withNews === 'true',
    });
    return sendXlsx(res, 'choferes.xlsx', buffer);
  }

  @Get('import/template')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  template(@Res({ passthrough: true }) res: Response): StreamableFile {
    return sendXlsx(
      res,
      'plantilla-choferes.xlsx',
      this.driversExcelService.template(),
    );
  }

  @Post('import')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  @ExcelImport()
  import(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.driversExcelService.import(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  @Get('me')
  @Auth(Role.DRIVER)
  findMe(@ActiveUser() user: ActiveUserInterface) {
    return this.driversService.findByUserId(user.id);
  }

  @Get()
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.HR)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: DriverStatus })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({
    name: 'withNews',
    required: false,
    description:
      'true = sólo choferes con incidentes sin resolver, el mismo corte del panel.',
  })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: DriverStatus,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('withNews') withNews?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.driversService.paginate(
      { page, limit },
      search,
      status,
      sortBy,
      order,
      withNews === 'true',
    );
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.HR)
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.driversService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.driversService.remove(id, user);
  }
}
