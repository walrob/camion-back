import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { SettlementStatus } from 'src/common/enums/settlementStatus.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Settlements (Liquidaciones)')
@ApiBearerAuth()
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post('trip/:tripId/generate')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  generate(
    @Param('tripId') tripId: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.settlementsService.generate(tripId, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @ApiQuery({ name: 'status', required: false, enum: SettlementStatus })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('status') status?: SettlementStatus,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    limit = limit > 100 ? 100 : limit;
    return this.settlementsService.paginate({ page, limit }, { status, driverId, from, to });
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  findOne(@Param('id') id: string) {
    return this.settlementsService.findOne(id);
  }

  @Get(':id/pdf')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  pdf(@Param('id') id: string) {
    return this.settlementsService.getPdfUrl(id);
  }

  @Post(':id/close')
  @Auth(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  close(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.settlementsService.close(id, user);
  }
}
