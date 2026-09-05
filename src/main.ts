import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Variables sin las cuales la app arranca igual y falla después, en silencio.
 *
 * No están acá las de base de datos ni las de S3 a propósito: ésas ya explotan
 * solas y con un mensaje claro —TypeORM al conectar y `StorageService` en su
 * constructor—, así que repetirlas sería ruido. Las de esta lista son las
 * traicioneras: el proceso levanta, el log dice "corriendo en 127.0.0.1:5006",
 * y el fallo recién aparece cuando un usuario intenta algo.
 *
 * - `JWT_SECRET`: sin ella todo intento de login devuelve 500.
 * - `FRONT_URL` (sólo en producción): sin ella la lista de orígenes de CORS
 *   queda vacía y **toda escritura desde el navegador devuelve 500**; además
 *   los mails de invitación, verificación y reset de contraseña salen con
 *   links sin host. Este error ya se produjo dos veces por escribir mal el
 *   nombre de la variable (`FRONTEND_URL`, `FRONT`) y las dos veces se
 *   descubrió en producción: de ahí que valga la pena chequearlo al arrancar.
 * - `BACK_URL`: sólo exigible si Mercado Pago está configurado. Es la URL a la
 *   que MP manda los avisos de pago; si queda relativa, MP postea al vacío y
 *   los pagos no se acreditan sin ningún error visible.
 */
function verificarEntorno(): void {
  const faltantes: string[] = [];

  if (!process.env.JWT_SECRET) faltantes.push('JWT_SECRET');

  if (process.env.NODE_ENV === 'production' && !process.env.FRONT_URL) {
    faltantes.push('FRONT_URL');
  }

  if (process.env.MP_ACCESS_TOKEN && !process.env.BACK_URL) {
    faltantes.push('BACK_URL (obligatoria si está definida MP_ACCESS_TOKEN)');
  }

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. ` +
        `Revisá el archivo .env.${process.env.NODE_ENV || 'development'}.`,
    );
  }
}

/**
 * Orígenes que el navegador puede declarar en producción.
 *
 * Se derivan de `FRONT_URL` en vez de listarse a mano: así el dominio se cambia
 * en un solo lugar. Se aceptan **siempre las dos** formas, con `www` y sin
 * `www`, porque cuál llega depende de por dónde entró el usuario y de si el
 * redirect del proxy corre antes o después de la petición. Aceptar una sola
 * deja media puerta cerrada, y el síntoma —un 500 en las escrituras, sólo para
 * algunos usuarios— es de los más difíciles de asociar a CORS.
 *
 * `CORS_EXTRA_ORIGINS` (lista separada por comas, opcional) queda para los
 * orígenes que no se derivan del dominio: la app empaquetada con Capacitor se
 * presenta como `capacitor://localhost`, que no se parece en nada a FRONT_URL.
 */
function origenesPermitidos(): string[] {
  const base = (process.env.FRONT_URL ?? '').trim().replace(/\/+$/, '');
  const origenes: string[] = [];

  if (base) {
    origenes.push(base);
    origenes.push(
      base.includes('://www.')
        ? base.replace('://www.', '://')
        : base.replace('://', '://www.'),
    );
  }

  for (const extra of (process.env.CORS_EXTRA_ORIGINS ?? '').split(',')) {
    const limpio = extra.trim().replace(/\/+$/, '');
    if (limpio) origenes.push(limpio);
  }

  return origenes;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Después de crear la app y no antes: las variables de los archivos `.env.*`
  // las carga `ConfigModule` durante la inicialización del módulo, así que
  // hasta esta línea `process.env` todavía no las tiene.
  verificarEntorno();

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

  // Se calcula una sola vez y no por request: la lista no cambia en caliente.
  const ORIGENES_PROD = origenesPermitidos();

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowed =
        process.env.NODE_ENV === 'production'
          ? ORIGENES_PROD.includes(origin)
          : LAN_ORIGIN.test(origin);

      if (allowed) return callback(null, true);

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CamioNex')
      .setDescription('API de gestión de flotas de camiones.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // En producción escucha sólo en loopback: nginx corre en la misma máquina y
  // es el único que necesita llegar. Con `0.0.0.0` el puerto queda publicado en
  // todas las interfaces y lo único que lo tapa es el security group —un
  // candado que administra otra gente y que en un EC2 compartido con otros
  // sistemas ya está abierto para otras cosas—.
  //
  // En desarrollo sigue en `0.0.0.0`, que es lo que permite probar desde el
  // celular. `HOST` lo fuerza si algún día esto corre en un contenedor, donde
  // atarse a loopback dejaría al proceso incomunicado.
  const host =
    process.env.HOST ??
    (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

  await app.listen(port, host);
  console.log(
    `✅ CamioNex API corriendo en ${host}:${port} - Modo ${process.env.NODE_ENV}`,
  );
}

bootstrap();
