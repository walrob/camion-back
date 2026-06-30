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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FuelService } from './fuel.service';
import { CreateFuelRecordDto } from './dto/create-fuel-record.dto';
import { UpdateFuelRecordDto } from './dto/update-fuel-record.dto';
import { FuelFilterDto } from './dto/fuel-filter.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Fuel')
@ApiBearerAuth()
@Controller('fuel')
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  @Post()
  @Auth(
    Role.DRIVER,
    Role.ADMIN,
    Role.MANAGER,
    Role.DISPATCHER,
    Role.MAINTENANCE,
  )
  create(
    @Body() dto: CreateFuelRecordDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.fuelService.create(dto, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE, Role.AUDITOR)
  paginate(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query() filter: FuelFilterDto,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.fuelService.paginate({ page, limit }, filter);
  }

  @Get('me')
  @Auth(Role.DRIVER)
  listMine(@ActiveUser() user: ActiveUserInterface) {
    return this.fuelService.listMine(user.id);
  }

  @Get('report')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  report(@Query() filter: FuelFilterDto) {
    return this.fuelService.report(filter);
  }

  @Get('report/export')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  async export(
    @Query() filter: FuelFilterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.fuelService.exportXlsx(filter);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="combustible.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.MAINTENANCE, Role.AUDITOR)
  findOne(@Param('id') id: string) {
    return this.fuelService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER, Role.DISPATCHER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFuelRecordDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.fuelService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER)
  remove(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.fuelService.remove(id, user);
  }
}
