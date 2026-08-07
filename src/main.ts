import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // En dev aceptamos localhost y cualquier IP de LAN privada, así se puede
  // probar desde el celular u otra PC con `nuxt dev --host`.
  // (10.0.2.2 = host de la máquina desde el emulador de Android.)
  const LAN_ORIGIN =
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowed =
        process.env.NODE_ENV === 'production'
          ? [process.env.FRONTEND_URL].filter(Boolean).includes(origin)
          : LAN_ORIGIN.test(origin);

      if (allowed) return callback(null, true);

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('FleetLog')
      .setDescription('API de gestión ERP para empresa textil.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');
  console.log(
    `✅ FleetLog API corriendo en puerto ${port} - Modo ${process.env.NODE_ENV}`,
  );
}

bootstrap();
