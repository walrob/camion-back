import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { StorageModule } from 'src/common/storage/storage.module';
import { PdfCompanyService } from './pdf-company.service';

/**
 * Provee el membrete de los comprobantes en PDF.
 *
 * `Company` entra con `TypeOrmModule` y no con `TenantTypeOrmModule`: es la
 * entidad raíz del multi-empresa, no una entidad filtrada por `companyId`.
 * Consultarla por el repositorio con filtro automático no encontraría nada.
 *
 * Va suelto en un módulo propio —y no dentro de `CompaniesModule`— para que los
 * módulos que emiten comprobantes puedan importarlo sin arrastrar todo el
 * dominio de empresas, que a su vez depende de auth.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Company]), StorageModule],
  providers: [PdfCompanyService],
  exports: [PdfCompanyService],
})
export class PdfModule {}
