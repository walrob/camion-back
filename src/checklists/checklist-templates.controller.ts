import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { SaveChecklistTemplateDto } from './dto/save-checklist-template.dto';
import { Auth, AuthFeature } from 'src/auth/decorators/auth.decorator';
import { Feature } from 'src/common/enums/feature.enum';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Checklist templates')
@ApiBearerAuth()
@Controller('checklist-templates')
export class ChecklistTemplatesController {
  constructor(private readonly templatesService: ChecklistTemplatesService) {}

  /**
   * La lectura la abre también a taller y gerencia: saber qué se le exige al
   * chofer antes de salir no es información de administración.
   */
  @Get()
  @Auth(Role.ADMIN, Role.MANAGER, Role.MAINTENANCE)
  @ApiOperation({ summary: 'Plantillas de checklist de la empresa.' })
  list() {
    return this.templatesService.list();
  }

  /**
   * Los ítems con los que opera una empresa que no configuró nada. La pantalla
   * los usa para precargar la primera plantilla: arrancar de una hoja en blanco
   * es lo que hace que nadie configure nada.
   *
   * Va antes de `:id` a propósito: si no, la ruta se la come el parámetro.
   */
  @Get('defaults')
  @Auth(Role.ADMIN, Role.MANAGER, Role.MAINTENANCE)
  defaults() {
    return this.templatesService.puntosPorDefecto();
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.MANAGER, Role.MAINTENANCE)
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @AuthFeature(Feature.CHECKLIST_TEMPLATES, Role.ADMIN)
  @ApiOperation({ summary: 'Crea una plantilla con sus ítems.' })
  create(
    @Body() dto: SaveChecklistTemplateDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.templatesService.save(dto, user);
  }

  @Patch(':id')
  @AuthFeature(Feature.CHECKLIST_TEMPLATES, Role.ADMIN)
  @ApiOperation({
    summary:
      'Reemplaza la plantilla y sus ítems. No afecta a los checklists ya emitidos.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: SaveChecklistTemplateDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.templatesService.save(dto, user, id);
  }

  @Delete(':id')
  @AuthFeature(Feature.CHECKLIST_TEMPLATES, Role.ADMIN)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.templatesService.remove(id, user);
  }
}
