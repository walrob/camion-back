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
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { FinishTripDto } from './dto/finish-trip.dto';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @Auth(Role.ADMIN, Role.DISPATCHER)
  create(@Body() dto: CreateTripDto, @ActiveUser() user: ActiveUserInterface) {
    return this.tripsService.create(dto, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.AUDITOR)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TripStatus })
  @ApiQuery({ name: 'truckId', required: false })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Fecha desde (inclusive, formato YYYY-MM-DD) sobre createdAt.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Fecha hasta (inclusive, formato YYYY-MM-DD) sobre createdAt.',
  })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: TripStatus,
    @Query('truckId') truckId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.tripsService.paginate(
      { page, limit },
      { search, status, truckId, driverId, from, to, sortBy, order },
    );
  }

  @Get('export')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.AUDITOR)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TripStatus })
  @ApiQuery({ name: 'truckId', required: false })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('status') status?: TripStatus,
    @Query('truckId') truckId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.tripsService.exportXlsx({
      search,
      status,
      truckId,
      driverId,
      from,
      to,
      sortBy,
      order,
    });
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="viajes.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Get('me')
  @Auth(Role.DRIVER)
  @ApiQuery({ name: 'status', required: false, enum: TripStatus })
  findMine(
    @ActiveUser() user: ActiveUserInterface,
    @Query('status') status?: TripStatus,
  ) {
    return this.tripsService.findMine(user.id, status);
  }

  @Get('me/:id')
  @Auth(Role.DRIVER)
  findMineOne(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripsService.findOneForDriver(id, user);
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.AUDITOR)
  findOne(@Param('id') id: string) {
    return this.tripsService.findOne(id);
  }

  @Get(':id/route-sheet')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.AUDITOR)
  async routeSheet(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.tripsService.buildRouteSheetPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="hoja-de-ruta.pdf"',
    });
    return new StreamableFile(buffer);
  }

  @Post(':id/start')
  @Auth(Role.DRIVER)
  start(
    @Param('id') id: string,
    @Body() dto: StartTripDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripsService.start(id, dto, user);
  }

  @Post(':id/finish')
  @Auth(Role.DRIVER)
  finish(
    @Param('id') id: string,
    @Body() dto: FinishTripDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripsService.finish(id, dto, user);
  }

  @Post(':id/cancel')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  cancel(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.tripsService.cancel(id, user);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripsService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.DISPATCHER)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.tripsService.remove(id, user);
  }
}
