import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-item.dto';
import { SignChecklistDto } from './dto/sign-checklist.dto';
import { SaveCompanionDto } from './dto/save-companion.dto';
import { ValidateChecklistDto } from './dto/validate-checklist.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

const LECTURA = [
  Role.DRIVER,
  Role.ADMIN,
  Role.DISPATCHER,
  Role.MAINTENANCE,
  Role.MANAGER,
] as const;

/** Quién libera una unidad: tráfico y quienes están por encima. */
const TRAFICO = [Role.DISPATCHER, Role.ADMIN, Role.MANAGER] as const;

@ApiTags('Checklists')
@ApiBearerAuth()
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Post()
  @Auth(Role.DRIVER)
  create(
    @Body() dto: CreateChecklistDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.createForTrip(dto, user);
  }

  /**
   * Va antes de `:id` a propósito: si no, la ruta se la come el parámetro.
   */
  @Get('pending-validation')
  @Auth(...TRAFICO)
  @ApiOperation({
    summary: 'Planillas firmadas que esperan que Tráfico libere la unidad.',
  })
  pendingValidation() {
    return this.checklistsService.pendingValidation();
  }

  /**
   * Personas del sistema que se pueden declarar como acompañantes.
   *
   * Va antes de `:id`, igual que la anterior. Devuelve nombre y si tiene el DNI
   * cargado, nunca el número de documento: el chofer necesita elegir a alguien,
   * no leer los datos personales de sus compañeros.
   */
  @Get('companion-candidates')
  @Auth(...LECTURA)
  @ApiOperation({
    summary: 'Empleados activos que pueden declararse como acompañantes.',
  })
  companionCandidates(
    @Query('search') search: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.companionCandidates(search, user);
  }

  @Get('trip/:tripId')
  @Auth(...LECTURA)
  getByTrip(@Param('tripId') tripId: string) {
    return this.checklistsService.getByTrip(tripId);
  }

  @Get(':id')
  @Auth(...LECTURA)
  findOne(@Param('id') id: string) {
    return this.checklistsService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.DRIVER)
  @ApiOperation({
    summary: 'Furgón, acompañante declarado, observación general y ubicación.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateChecklistDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.update(id, dto, user);
  }

  @Patch('items/:itemId')
  @Auth(Role.DRIVER)
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.updateItem(itemId, dto, user);
  }

  @Post(':id/companions')
  @Auth(Role.DRIVER)
  @ApiOperation({ summary: 'Declara un acompañante en la planilla.' })
  addCompanion(
    @Param('id') id: string,
    @Body() dto: SaveCompanionDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.addCompanion(id, dto, user);
  }

  @Delete('companions/:companionId')
  @Auth(Role.DRIVER)
  removeCompanion(
    @Param('companionId') companionId: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.removeCompanion(companionId, user);
  }

  @Post(':id/sign')
  @Auth(Role.DRIVER)
  sign(
    @Param('id') id: string,
    @Body() dto: SignChecklistDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.sign(id, dto, user);
  }

  @Post(':id/validate')
  @Auth(...TRAFICO)
  @ApiOperation({
    summary:
      'Tráfico libera —o no— una unidad cuya planilla quedó pendiente de validación.',
  })
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateChecklistDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.validate(id, dto, user);
  }
}
