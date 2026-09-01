import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogsService } from './catalogs.service';
import { SaveCatalogDto } from './dto/save-catalog.dto';
import { Auth, AuthFeature } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Catalogs')
@ApiBearerAuth()
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  /**
   * Sin roles ni feature: los lee cualquiera con sesión, **el chofer incluido**.
   * Su app necesita los tipos de gasto y de incidente para poder cargar, y los
   * cachea para cuando se corta la señal. Lo que el plan gatea es editarlos.
   */
  @Get()
  @Auth()
  @ApiOperation({ summary: 'Catálogos de la empresa con sus elementos.' })
  all() {
    return this.catalogsService.all();
  }

  @Put(':catalog')
  @AuthFeature(Feature.CATALOGS, Role.ADMIN)
  @ApiOperation({
    summary:
      'Guarda el catálogo completo, en orden. Lo que no venga en la lista se desactiva.',
  })
  save(
    @Param('catalog') catalog: string,
    @Body() dto: SaveCatalogDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.catalogsService.save(catalog, dto, user);
  }
}
