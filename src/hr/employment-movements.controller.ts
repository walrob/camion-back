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
import { EmploymentMovementsService } from './employment-movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('HR - Employment movements')
@ApiBearerAuth()
@Controller('hr/movements')
export class EmploymentMovementsController {
  constructor(
    private readonly movementsService: EmploymentMovementsService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.HR)
  create(
    @Body() dto: CreateMovementDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.movementsService.create(dto, user);
  }

  /** Licencias y suspensiones vigentes hoy. */
  @Get('active')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  active() {
    return this.movementsService.active();
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  findOne(@Param('id') id: string) {
    return this.movementsService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.HR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMovementDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.movementsService.update(id, dto, user);
  }

  /** Reincorporación anticipada: cierra hoy el período abierto. */
  @Patch(':id/close')
  @Auth(Role.ADMIN, Role.HR)
  close(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.movementsService.close(id, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.HR)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.movementsService.remove(id, user);
  }
}
