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
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @Auth(Role.ADMIN, Role.DISPATCHER)
  create(
    @Body() dto: CreateDriverDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.driversService.create(dto, user);
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
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: DriverStatus,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.driversService.paginate({ page, limit }, search, status);
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
