import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  TypeOrmModule,
  getDataSourceToken,
  getRepositoryToken,
} from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { TenantRepository } from './tenant.repository';

/**
 * Reemplazo de `TypeOrmModule.forFeature` para las entidades de empresa.
 *
 * Provee el MISMO token que `TypeOrmModule.forFeature` (`getRepositoryToken`),
 * pero con un `TenantRepository` en lugar del repositorio estándar. Gracias a
 * eso, los servicios siguen escribiendo `@InjectRepository(Trip)` y no hay que
 * tocar ni una línea de los 24 servicios de dominio: el filtrado por empresa
 * aparece solo.
 *
 * Uso, en el módulo de cada dominio:
 *
 *   imports: [TenantTypeOrmModule.forFeature([Trip])]   // en vez de TypeOrmModule
 *
 * Las entidades de catálogo global (`Company`, `Plan`) siguen usando
 * `TypeOrmModule.forFeature`: no tienen `companyId` y no deben filtrarse.
 */
@Module({})
export class TenantTypeOrmModule {
  static forFeature(entities: EntityTarget<ObjectLiteral>[]): DynamicModule {
    const providers: Provider[] = entities.map((entity) => ({
      provide: getRepositoryToken(entity as Parameters<typeof getRepositoryToken>[0]),
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) =>
        new TenantRepository(entity, dataSource.createEntityManager()),
    }));

    return {
      module: TenantTypeOrmModule,
      // Imprescindible: `TypeOrmModule.forFeature` no sólo crea el proveedor del
      // repositorio, también es lo que REGISTRA la entidad en el DataSource
      // cuando se usa `autoLoadEntities`. Sin esta línea, TypeORM levanta
      // "No metadata for X was found" al primer acceso.
      // Los proveedores propios de este módulo pisan a los que trae ese import,
      // así que `@InjectRepository` recibe el TenantRepository.
      imports: [TypeOrmModule.forFeature(entities as EntityClassOrSchema[])],
      providers,
      exports: providers,
    };
  }
}
