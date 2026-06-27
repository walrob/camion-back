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
import { FleetsService } from './fleets.service';
import { CreateFleetDto } from './dto/create-fleet.dto';
import { UpdateFleetDto } from './dto/update-fleet.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Fleets')
@ApiBearerAuth()
@Controller('fleets')
export class FleetsController {
  constructor(private readonly fleetsService: FleetsService) {}

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
