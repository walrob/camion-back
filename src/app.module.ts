import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MailerModule } from '@nestjs-modules/mailer';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './common/storage/storage.module';
import { AttachmentsModule } from './common/attachments/attachments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FleetModule } from './fleet/fleet.module';
import { DriversModule } from './drivers/drivers.module';
import { HrModule } from './hr/hr.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { TripsModule } from './trips/trips.module';
import { TripLogModule } from './trip-log/trip-log.module';
import { SettlementsModule } from './settlements/settlements.module';
import { IncidentsModule } from './incidents/incidents.module';
import { AlertsModule } from './alerts/alerts.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { DocumentsModule } from './documents/documents.module';
import { IndicatorsModule } from './indicators/indicators.module';
import { MessagesModule } from './messages/messages.module';
import { PushModule } from './notifications/push/push.module';
import { FuelModule } from './fuel/fuel.module';
import { OeaModule } from './oea/oea.module';
import { CompaniesModule } from './companies/companies.module';
import { PlansModule } from './plans/plans.module';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantContextMiddleware } from './common/tenant/tenant-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true,
    }),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadEntities: true,

        // El esquema se cambia SOLO por migración. `synchronize: true` aplicaba
        // cambios automáticos y no auditados en cada arranque: era imposible
        // agregar `companyId` a las 27 entidades y migrar los datos existentes
        // de forma controlada y reversible.
        // La configuración equivalente para el CLI está en
        // `src/database/data-source.ts`.
        synchronize: false,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsRun: true,
      }),
    }),

    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('SMTP_HOST'),
          port: Number(configService.get('SMTP_PORT')),
          secure: configService.get('SMTP_SECURE') === 'true',
          auth: {
            user: configService.get('AUTH_EMAIL'),
            pass: configService.get('PASSWORD_EMAIL'),
          },
        },
        defaults: {
          from: configService.get('FROM_EMAIL'),
        },
      }),
    }),

    // Multi-empresa: van primero porque el resto de las entidades referencian
    // Company a través de TenantEntity.
    CompaniesModule,
    PlansModule,
    // Global: engancha el TenantSubscriber (estampado y tripwire) al DataSource.
    TenantModule,
    UsersModule,
    AuthModule,
    StorageModule,
    AttachmentsModule,
    NotificationsModule,
    DashboardModule,
    FleetModule,
    DriversModule,
    AlertsModule,
    HrModule,
    ChecklistsModule,
    TripsModule,
    TripLogModule,
    SettlementsModule,
    IncidentsModule,
    MaintenanceModule,
    DocumentsModule,
    IndicatorsModule,
    MessagesModule,
    PushModule,
    FuelModule,
    OeaModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // A TODAS las rutas: si sólo se aplicara a las autenticadas, una ruta nueva
    // que se olvide de registrar quedaría sin contexto y sin filtrar.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
