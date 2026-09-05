import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './entities/trip.entity';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { AuthModule } from 'src/auth/auth.module';
import { FleetModule } from 'src/fleet/fleet.module';
import { DriversModule } from 'src/drivers/drivers.module';
import { ChecklistsModule } from 'src/checklists/checklists.module';
import { HrModule } from 'src/hr/hr.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { SequencesModule } from 'src/common/sequences/sequences.module';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { Settlement } from 'src/settlements/entities/settlement.entity';
import { OeaModule } from 'src/oea/oea.module';
import { DocumentsModule } from 'src/documents/documents.module';
import { PdfModule } from 'src/common/pdf/pdf.module';

@Module({
  imports: [
    // `Settlement` entra sólo como entidad (no el módulo) para poder consultar
    // si un viaje ya se rindió sin depender de `SettlementsModule`, que a su
    // vez depende de éste.
    TenantTypeOrmModule.forFeature([Trip, Trailer, Settlement]),
    forwardRef(() => AuthModule),
    FleetModule,
    DriversModule,
    ChecklistsModule,
    // Para validar la situación del legajo del chofer al asignarle un viaje.
    HrModule,
    AlertsModule,
    // Correlativos por empresa para el código visible.
    SequencesModule,
    // Los dos entran por los ajustes configurables de «qué se exige antes de
    // salir»: la planilla OEA conforme y la documentación vigente
    // (docs/CONFIGURACION.md §4.2). Ninguno de los dos módulos depende de
    // viajes, así que no hace falta forwardRef.
    OeaModule,
    DocumentsModule,
    // Membrete de la hoja de ruta en PDF, con los datos de la empresa.
    PdfModule,
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
