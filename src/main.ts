import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');

  // Cuántos proxies hay delante de la aplicación.
  //
  // Importa desde que el rate limit está activo: en producción la app escucha en
  // texto plano y es nginx quien termina TLS, así que sin esto `req.ip` es
  // siempre la IP del proxy y **todo el tráfico anónimo comparte un solo
  // contador**. El límite del login son 20 intentos cada 10 minutos: sumados
  // entre todos los clientes, se agota en minutos y deja a todo el mundo afuera.
  //
  // El default en producción es 1 (nginx en la misma máquina). Si mañana se
  // suma un balanceador o un CDN, hay que subirlo a 2: contar de menos hace que
  // se lea la IP del salto equivocado.
  //
  // El riesgo del otro lado es conocido y menor: confiar en `X-Forwarded-For`
  // permite que alguien falsee su IP y se saltee su propio límite. Es preferible
  // a bloquear a los usuarios legítimos, que es lo que pasa si se cuenta de
  // menos.
  const saltosDeProxy = Number(
    process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 1 : 0),
  );
  if (saltosDeProxy > 0) {
    app.set('trust proxy', saltosDeProxy);
  }

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
          ? [process.env.FRONT_URL].filter(Boolean).includes(origin)
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
