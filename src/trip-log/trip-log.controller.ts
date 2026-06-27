import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TripLogService } from './trip-log.service';
import { CreateTripLogEntryDto } from './dto/create-trip-log-entry.dto';
import { UpdateTripLogEntryDto } from './dto/update-trip-log-entry.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Trip Log (Bitácora)')
@ApiBearerAuth()
@Controller('trip-log')
export class TripLogController {
  constructor(private readonly tripLogService: TripLogService) {}

  @Post()
  @Auth(Role.DRIVER)
  create(
    @Body() dto: CreateTripLogEntryDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripLogService.create(dto, user);
  }

  // ───────── Chofer ─────────
  @Get('me')
  @Auth(Role.DRIVER)
  listMine(@ActiveUser() user: ActiveUserInterface) {
    return this.tripLogService.listMine(user.id);
  }

  @Get('me/trip/:tripId')
  @Auth(Role.DRIVER)
  listMineByTrip(
    @Param('tripId') tripId: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripLogService.listByTripOwned(tripId, user);
  }

  @Get('me/trip/:tripId/summary')
  @Auth(Role.DRIVER)
  summaryMine(
    @Param('tripId') tripId: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripLogService.summaryOwned(tripId, user);
  }

  @Patch(':id')
  @Auth(Role.DRIVER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTripLogEntryDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.tripLogService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.DRIVER)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.tripLogService.remove(id, user);
  }

  // ───────── Backoffice ─────────
  @Get('trip/:tripId')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.AUDITOR)
  listByTrip(@Param('tripId') tripId: string) {
    return this.tripLogService.listByTrip(tripId);
  }

  @Get('trip/:tripId/summary')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER, Role.AUDITOR)
  summary(@Param('tripId') tripId: string) {
    return this.tripLogService.summary(tripId);
  }
}
