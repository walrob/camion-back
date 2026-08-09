import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * DataSource para el CLI de TypeORM (generar y correr migraciones).
 *
 * Es una configuración separada de la de `app.module.ts` a propósito: el CLI
 * corre fuera de Nest, así que no puede usar `autoLoadEntities` y necesita los
 * globs de entidades y migraciones de forma explícita.
 *
 * Las variables de entorno ya definidas en la shell tienen prioridad sobre el
 * archivo `.env.*` (dotenv no pisa lo que ya existe). Eso permite apuntar a una
 * base descartable sin tocar ningún archivo, que es como se verifican las
 * migraciones antes de llevarlas a producción:
 *
 *   DB_DATABASE=db_camiones_test npm run migration:run
 */
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
loadEnv({ path: resolve(process.cwd(), envFile) });

/** true cuando el proceso corre desde `dist/` (build de producción). */
const isCompiled = __filename.endsWith('.js');

export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  // El esquema se cambia SOLO por migración. Ver el comentario de app.module.ts.
  synchronize: false,

  entities: [
    isCompiled ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts',
  ],
  migrations: [
    isCompiled
      ? 'dist/database/migrations/*.js'
      : 'src/database/migrations/*.ts',
  ],

  // Nombre de la tabla de control de migraciones (el default de TypeORM).
  migrationsTableName: 'migrations',
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
