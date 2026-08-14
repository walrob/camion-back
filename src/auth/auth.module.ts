import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CompaniesModule } from 'src/companies/companies.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    ConfigModule,
    // `GET /auth/session` devuelve la empresa junto con su plan.
    forwardRef(() => CompaniesModule),
    // El mail de confirmación de la casilla. Circular porque
    // `NotificationsModule` protege sus rutas con los guards de auth.
    forwardRef(() => NotificationsModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
        global: true,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // `AuthService` se exporta para el alta pública de empresas: el mail de
  // confirmación de la casilla sale del mismo lugar que lo valida.
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
