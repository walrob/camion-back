import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler/app-throttler.guard';
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
import { BillingModule } from './billing/billing.module';
import { InvitesModule } from './invites/invites.module';
import { MpPaymentsModule } from './mp-payments/mp-payments.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { SettingsModule } from './settings/settings.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantContextMiddleware } from './common/tenant/tenant-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true,
    }),

    ScheduleModule.forRoot(),

    // El default es holgado para no molestar al uso normal; los endpoints
    // públicos que crean cuentas lo ajustan con @Throttle (R6.1). Qué se cuenta
    // —sesión o IP— lo decide `AppThrottlerGuard`, que además es lo que hace que
    // esta configuración tenga efecto: sin el APP_GUARD de más abajo, el módulo
    // no intercepta ningún request.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

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
    BillingModule,
    MpPaymentsModule,
    // Va después de MpPaymentsModule: es quien recibe los avisos que aquél
    // procesa.
    WebhooksModule,
    InvitesModule,
    // Global: la auditoría la usan facturación, empresas y superadmin.
    AuditLogModule,
    // Global: los ajustes de operación los consulta cualquier dominio.
    SettingsModule,
    // Global: los catálogos de negocio (tipos de gasto, de incidente…).
    CatalogsModule,
    // Global: monedas y cotizaciones para los viajes internacionales.
    CurrenciesModule,
    SuperadminModule,
  ],
  controllers: [],
  providers: [
    // Global y no por controlador: un límite que hay que acordarse de poner en
    // cada ruta nueva es un límite que tarde o temprano falta justo donde
    // importa. Los endpoints que necesitan un techo distinto lo declaran con
    // @Throttle, que ahora sí surte efecto.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // A TODAS las rutas: si sólo se aplicara a las autenticadas, una ruta nueva
    // que se olvide de registrar quedaría sin contexto y sin filtrar.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
