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
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TrucksService } from './trucks.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { UpdateOdometerDto } from './dto/update-odometer.dto';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Trucks')
@ApiBearerAuth()
@Controller('trucks')
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) {}

  @Post()
  @Auth(Role.ADMIN, Role.MANAGER)
  create(
    @Body() dto: CreateTruckDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.trucksService.create(dto, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TruckStatus })
  @ApiQuery({ name: 'fleetId', required: false })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: TruckStatus,
    @Query('fleetId') fleetId?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.trucksService.paginate({ page, limit }, search, status, fleetId);
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  findOne(@Param('id') id: string) {
    return this.trucksService.findOne(id);
  }

  @Patch(':id/odometer')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE)
  updateOdometer(
    @Param('id') id: string,
    @Body() dto: UpdateOdometerDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.trucksService.updateOdometer(id, dto, user);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTruckDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.trucksService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.trucksService.remove(id, user);
  }
}
