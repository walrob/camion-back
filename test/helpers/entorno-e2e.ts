import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import * as bcryptjs from 'bcryptjs';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';

/**
 * Entorno compartido de los tests de integración.
 *
 * Levanta la aplicación real —los mismos módulos, guards y pipes que `main.ts`—
 * contra una base descartable, y siembra **dos empresas con datos espejados**:
 * misma patente, mismo código de viaje, mismo documento. Si el aislamiento
 * fallara, los tests verían datos de la otra empresa en vez de un error.
 *
 * La base se crea y se destruye en cada corrida: los tests no dependen de nada
 * previo y no ensucian las bases de desarrollo.
 */

export const BASE_E2E = 'db_camiones_e2e';

export const EMPRESA_A = 'aaaaaaaa-e2e0-4000-8000-00000000000a';
export const EMPRESA_B = 'bbbbbbbb-e2e0-4000-8000-00000000000b';

export const EMAIL_A = 'admin-a@e2e.test';
export const EMAIL_B = 'admin-b@e2e.test';
export const PASSWORD = 'Passw0rd!E2E';

export interface EntornoE2E {
  app: INestApplication;
  dataSource: DataSource;
  /** Identificadores sembrados en cada empresa, para detectar fugas. */
  idsDeA: string[];
  idsDeB: string[];
  truckA: string;
  truckB: string;
}

/** Carga las credenciales de desarrollo y apunta a la base descartable. */
function prepararEnv(): void {
  loadEnv({ path: resolve(process.cwd(), '.env.development') });
  process.env.DB_DATABASE = BASE_E2E;
  // Sin esto el seeder crearía un admin extra y ensuciaría los conteos.
  process.env.SEED_ADMIN_EMAIL = 'seed-noop@e2e.test';
}

async function recrearBase(): Promise<void> {
  const con = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
  await con.query(`DROP DATABASE IF EXISTS \`${BASE_E2E}\``);
  await con.query(`CREATE DATABASE \`${BASE_E2E}\` CHARACTER SET utf8mb4`);
  await con.end();
}

export async function levantarEntorno(): Promise<EntornoE2E> {
  prepararEnv();
  await recrearBase();

  // Se importa DESPUÉS de fijar las variables: el módulo lee la configuración
  // al evaluarse.
  const { AppModule } = await import('src/app.module');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  // Mismo prefijo y mismo pipe que `main.ts`: si el entorno de test difiriera
  // del real, sus resultados no serían representativos.
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  await app.init();

  const ds = app.get(DataSource);
  const semilla = await sembrar(ds);

  return { app, dataSource: ds, ...semilla };
}

export async function cerrarEntorno(entorno: EntornoE2E): Promise<void> {
  await entorno.app.close();

  const con = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
  await con.query(`DROP DATABASE IF EXISTS \`${BASE_E2E}\``);
  await con.end();
}

/** Dos empresas con datos espejados. */
async function sembrar(ds: DataSource) {
  const hash = await bcryptjs.hash(PASSWORD, 10);
  const idsDeA: string[] = [EMPRESA_A];
  const idsDeB: string[] = [EMPRESA_B];

  const planGestion = await idDePlan(ds, 'gestion');

  const crearEmpresa = async (id: string, nombre: string, slug: string) => {
    await ds.query(
      'INSERT INTO `companies` (`id`,`name`,`slug`,`status`,`planId`,`billingDay`) ' +
        "VALUES (?,?,?,'active',?,1)",
      [id, nombre, slug, planGestion],
    );
  };

  await crearEmpresa(EMPRESA_A, 'Transporte A', 'transporte-a-e2e');
  await crearEmpresa(EMPRESA_B, 'Transporte B', 'transporte-b-e2e');

  const crearUsuario = async (companyId: string, email: string) => {
    const id = uuidPara(companyId, 'user');
    await ds.query(
      "INSERT INTO `user` (`id`,`companyId`,`email`,`name`,`password`,`role`) VALUES (?,?,?,'Admin',?, 'admin')",
      [id, companyId, email, hash],
    );
    return id;
  };
  idsDeA.push(await crearUsuario(EMPRESA_A, EMAIL_A));
  idsDeB.push(await crearUsuario(EMPRESA_B, EMAIL_B));

  // Datos espejados: la MISMA patente y el MISMO código en las dos empresas.
  const crearFlota = async (companyId: string, sufijo: string) => {
    const truckId = uuidPara(companyId, 'truck');
    await ds.query(
      'INSERT INTO `trucks` (`id`,`companyId`,`plate`,`internalNumber`,`currentOdometerKm`,`engineHours`,`status`,`billingStatus`) ' +
        "VALUES (?,?,'ESPEJO99',?,0,0,'available','active')",
      [truckId, companyId, `INT-${sufijo}`],
    );

    const employeeId = uuidPara(companyId, 'employee');
    await ds.query(
      'INSERT INTO `employees` (`id`,`companyId`,`firstName`,`lastName`,`documentId`) ' +
        "VALUES (?,?,'Chofer',?, '30000000')",
      [employeeId, companyId, sufijo],
    );

    const driverId = uuidPara(companyId, 'driver');
    await ds.query(
      'INSERT INTO `drivers` (`id`,`companyId`,`employeeId`) VALUES (?,?,?)',
      [driverId, companyId, employeeId],
    );

    const tripId = uuidPara(companyId, 'trip');
    await ds.query(
      'INSERT INTO `trips` (`id`,`companyId`,`code`,`truckId`,`driverId`,`origin`,`destination`,`status`) ' +
        "VALUES (?,?,'V-00001',?,?,'Origen','Destino','assigned')",
      [tripId, companyId, truckId, driverId],
    );

    return { truckId, employeeId, driverId, tripId };
  };

  const flotaA = await crearFlota(EMPRESA_A, 'A');
  const flotaB = await crearFlota(EMPRESA_B, 'B');

  idsDeA.push(...Object.values(flotaA));
  idsDeB.push(...Object.values(flotaB));

  return {
    idsDeA,
    idsDeB,
    truckA: flotaA.truckId,
    truckB: flotaB.truckId,
  };
}

async function idDePlan(ds: DataSource, code: string): Promise<string> {
  const [fila] = await ds.query('SELECT `id` FROM `plans` WHERE `code` = ?', [
    code,
  ]);
  return fila.id;
}

/** UUID determinista y reconocible, para poder buscarlo en las respuestas. */
function uuidPara(companyId: string, tipo: string): string {
  const letra = companyId === EMPRESA_A ? 'a' : 'b';
  const mapa: Record<string, string> = {
    user: '1',
    truck: '2',
    employee: '3',
    driver: '4',
    trip: '5',
  };
  const n = mapa[tipo] ?? '9';
  return `${letra}${letra}${letra}${letra}${letra}${letra}${letra}${letra}-e2e0-4000-8000-00000000000${n}`;
}

export async function login(
  app: INestApplication,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });

  if (!res.body?.token) {
    throw new Error(
      `Login fallido para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.token;
}

export const loginA = (app: INestApplication) => login(app, EMAIL_A);
export const loginB = (app: INestApplication) => login(app, EMAIL_B);

/** Cambia el plan de una empresa y espera a que caduque la caché del plan. */
export async function cambiarPlan(
  entorno: EntornoE2E,
  companyId: string,
  code: string,
): Promise<void> {
  await entorno.dataSource.query(
    'UPDATE `companies` SET `planId` = (SELECT `id` FROM `plans` WHERE `code` = ?) WHERE `id` = ?',
    [code, companyId],
  );
  // El plan se cachea 60 s; en los tests se invalida directo para no esperar.
  const { PlanContextService } = await import(
    'src/plans/plan-context.service'
  );
  entorno.app.get(PlanContextService).invalidarTodo();
}
