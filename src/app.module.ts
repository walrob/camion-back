import { Module } from '@nestjs/common';
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
import { TripsModule } from './trips/trips.module';
import { TripLogModule } from './trip-log/trip-log.module';
import { SettlementsModule } from './settlements/settlements.module';

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
        synchronize: true,
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

    UsersModule,
    AuthModule,
    StorageModule,
    AttachmentsModule,
    NotificationsModule,
    DashboardModule,
    FleetModule,
    DriversModule,
    HrModule,
    TripsModule,
    TripLogModule,
    SettlementsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
