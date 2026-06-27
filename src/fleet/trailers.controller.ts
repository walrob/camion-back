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
import { TrailersService } from './trailers.service';
import { CreateTrailerDto } from './dto/create-trailer.dto';
import { UpdateTrailerDto } from './dto/update-trailer.dto';
import { TrailerStatus } from 'src/common/enums/trailerStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Trailers')
@ApiBearerAuth()
@Controller('trailers')
export class TrailersController {
  constructor(private readonly trailersService: TrailersService) {}

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
