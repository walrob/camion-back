import { forwardRef, Global, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';
import { AuthModule } from 'src/auth/auth.module';

/**
 * `@Global()`, como `SettingsModule`: los catálogos los consultan liquidaciones
 * (para saber qué resta), la bitácora, incidentes y toda exportación que
 * necesite la etiqueta de una clave.
 */
@Global()
@Module({
  imports: [
    TenantTypeOrmModule.forFeature([CatalogItem]),
    forwardRef(() => AuthModule),
  ],
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
