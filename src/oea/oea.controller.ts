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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OeaService } from './oea.service';
import { CreateOeaInspectionDto } from './dto/create-oea-inspection.dto';
import { UpdateOeaInspectionDto } from './dto/update-oea-inspection.dto';
import { UpdateOeaItemDto } from './dto/update-oea-item.dto';
import { SignOeaDto } from './dto/sign-oea.dto';
import { OeaFilterDto } from './dto/oea-filter.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('OEA')
@ApiBearerAuth()
@Controller('oea')
export class OeaController {
  constructor(private readonly oeaService: OeaService) {}

  @Post()
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.AUDITOR)
  create(
    @Body() dto: CreateOeaInspectionDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.oeaService.create(dto, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.AUDITOR)
  paginate(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query() filter: OeaFilterDto,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.oeaService.paginate({ page, limit }, filter);
  }

  @Get('me')
  @Auth(Role.DRIVER)
  listMine(@ActiveUser() user: ActiveUserInterface) {
    return this.oeaService.listMine(user.id);
  }

  @Get('trip/:tripId')
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.AUDITOR)
  getByTrip(@Param('tripId') tripId: string) {
    return this.oeaService.getByTrip(tripId);
  }

  @Get(':id')
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.AUDITOR)
  findOne(@Param('id') id: string) {
    return this.oeaService.findOne(id);
  }

  @Patch('items/:itemId')
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.AUDITOR)
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOeaItemDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.oeaService.updateItem(itemId, dto, user);
  }

  @Patch(':id')
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.AUDITOR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOeaInspectionDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.oeaService.update(id, dto, user);
  }

  @Post(':id/sign')
  @Auth(Role.DRIVER, Role.ADMIN, Role.MANAGER, Role.DISPATCHER, Role.AUDITOR)
  sign(
    @Param('id') id: string,
    @Body() dto: SignOeaDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.oeaService.sign(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.MANAGER)
  remove(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.oeaService.remove(id, user);
  }
}
