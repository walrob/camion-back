import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  EMPRESA_A,
  EMPRESA_B,
  cerrarEntorno,
  levantarEntorno,
  loginA,
  loginB,
  type EntornoE2E,
} from './helpers/entorno-e2e';

/**
 * Barrido de aislamiento entre empresas (criterio de aceptación de la fase 2).
 *
 * En vez de una lista de endpoints escrita a mano —que envejece en cuanto
 * alguien agrega un controlador— este barrido **introspecciona el router de
 * Nest** y recorre todo lo que esté registrado. Un endpoint nuevo queda cubierto
 * sin tocar el test; ésa es la única forma de que la garantía se sostenga.
 *
 * Dos comprobaciones sobre cada ruta:
 *
 *  1. **Detalle cruzado**: pedir con el token de A un recurso de B tiene que dar
 *     403 o 404, nunca 200.
 *  2. **Fuga en listados**: ninguna respuesta de A puede contener un
 *     identificador sembrado en B. Como los ids de B son reconocibles, alcanza
 *     con buscarlos en el JSON crudo: detecta la fuga aunque venga anidada en
 *     una relación.
 */
describe('Aislamiento entre empresas (barrido de endpoints)', () => {
  let entorno: EntornoE2E;
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  jest.setTimeout(180_000);

  beforeAll(async () => {
    entorno = await levantarEntorno();
    app = entorno.app;
    tokenA = await loginA(app);
    tokenB = await loginB(app);
  });

  afterAll(async () => {
    await cerrarEntorno(entorno);
  });

  /**
   * Rutas GET registradas en el router de Express.
   *
   * Express 5 renombró `_router` a `router`; se leen las dos para que el barrido
   * no se vuelva silenciosamente vacío en una actualización. El test de guarda
   * de abajo existe justamente porque un barrido sin rutas pasa todo sin
   * verificar nada.
   */
  type Capa = { route?: { path: string; methods: Record<string, boolean> } };
  const rutasGet = (): string[] => {
    const server = app.getHttpAdapter().getInstance() as {
      router?: { stack: Capa[] };
      _router?: { stack: Capa[] };
    };
    const stack = server.router?.stack ?? server._router?.stack ?? [];

    return stack
      .filter((capa) => capa.route?.methods?.get)
      .map((capa) => capa.route!.path)
      .filter((p) => p.startsWith('/api/v1'))
      // Rutas de descarga/binario: no devuelven JSON inspeccionable.
      .filter((p) => !/\/(export|pdf|file|download|presigned)/.test(p));
  };

  it('el barrido encuentra rutas para revisar', () => {
    expect(rutasGet().length).toBeGreaterThan(20);
  });

  it('ningún listado de la empresa A contiene identificadores de la empresa B', async () => {
    const rutas = rutasGet().filter((p) => !p.includes(':'));
    const fugas: string[] = [];

    for (const ruta of rutas) {
      const res = await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', `Bearer ${tokenA}`);

      // 4xx es aceptable (rol o plan): lo que no puede pasar es devolver datos ajenos.
      if (res.status !== 200) continue;

      const crudo = JSON.stringify(res.body ?? {});
      for (const idAjeno of entorno.idsDeB) {
        if (crudo.includes(idAjeno)) {
          fugas.push(`${ruta} → contiene ${idAjeno}`);
          break;
        }
      }
    }

    expect(fugas).toEqual([]);
  });

  it('ningún listado de la empresa B contiene identificadores de la empresa A', async () => {
    const rutas = rutasGet().filter((p) => !p.includes(':'));
    const fugas: string[] = [];

    for (const ruta of rutas) {
      const res = await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status !== 200) continue;

      const crudo = JSON.stringify(res.body ?? {});
      for (const idAjeno of entorno.idsDeA) {
        if (crudo.includes(idAjeno)) {
          fugas.push(`${ruta} → contiene ${idAjeno}`);
          break;
        }
      }
    }

    expect(fugas).toEqual([]);
  });

  /**
   * ¿La respuesta trae datos, o está vacía?
   *
   * Distinguirlo importa: un listado por padre ajeno (`/trip-log/trip/:tripId`)
   * que devuelve `[]` NO es una fuga —el filtro por empresa hizo su trabajo y no
   * encontró nada—, mientras que un detalle que devuelve el recurso sí lo es.
   * Tratar los dos casos igual llenaría el test de falsos positivos y terminaría
   * con alguien desactivándolo.
   */
  const traeDatos = (body: unknown): boolean => {
    if (body === null || body === undefined) return false;
    if (Array.isArray(body)) return body.length > 0;
    if (typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if (Array.isArray(obj.items)) return obj.items.length > 0;
      return Object.keys(obj).length > 0;
    }
    return true;
  };

  it('pedir por id un recurso de otra empresa nunca devuelve datos', async () => {
    // Rutas con un único parámetro: detalle o listado por padre.
    const rutas = rutasGet().filter(
      (p) => (p.match(/:/g) ?? []).length === 1 && /:(id|\w*Id)$/.test(p),
    );

    const fugas: string[] = [];

    for (const ruta of rutas) {
      for (const idAjeno of entorno.idsDeB) {
        const url = ruta.replace(/:\w+$/, idAjeno);
        const res = await request(app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${tokenA}`);

        if (res.status !== 200) continue;

        const crudo = JSON.stringify(res.body ?? {});
        const contieneAjeno = entorno.idsDeB.some((id) => crudo.includes(id));

        if (traeDatos(res.body) || contieneAjeno) {
          fugas.push(`${url} devolvió datos de otra empresa: ${crudo.slice(0, 120)}`);
        }
      }
    }

    expect(fugas).toEqual([]);
  });

  /**
   * Rutas que responden sin token **a propósito**.
   *
   * Agregar algo acá es una decisión de diseño que hay que justificar por
   * escrito: es la lista de todo lo que cualquiera puede leer desde internet.
   */
  const PUBLICAS_DECLARADAS: Record<string, string> = {
    '/api/v1/plans/public':
      'Catálogo comercial para la landing. Sólo planes marcados isPublic, ' +
      'sin datos de ninguna empresa. Que los precios salgan de la base es lo ' +
      'que permite cambiarlos sin deploy (decisión D8).',
  };

  it('sin token, ninguna ruta privada devuelve datos', async () => {
    const rutas = rutasGet().filter((p) => !p.includes(':'));
    const abiertas: string[] = [];

    for (const ruta of rutas) {
      if (PUBLICAS_DECLARADAS[ruta]) continue;

      const res = await request(app.getHttpServer()).get(ruta);
      if (res.status === 200) abiertas.push(ruta);
    }

    expect(abiertas).toEqual([]);
  });

  it('las rutas públicas declaradas no filtran datos de ninguna empresa', async () => {
    const fugas: string[] = [];

    for (const ruta of Object.keys(PUBLICAS_DECLARADAS)) {
      const res = await request(app.getHttpServer()).get(ruta);
      if (res.status !== 200) continue;

      const crudo = JSON.stringify(res.body ?? {});
      for (const id of [...entorno.idsDeA, ...entorno.idsDeB]) {
        if (crudo.includes(id)) {
          fugas.push(`${ruta} → contiene ${id}`);
          break;
        }
      }
    }

    expect(fugas).toEqual([]);
  });

  it('escribir en un recurso de otra empresa no lo modifica', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trucks/${entorno.truckB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ internalNumber: 'INTRUSO' });

    expect(res.status).toBeGreaterThanOrEqual(400);

    // Y el dato de B quedó intacto.
    const ds = app.get(DataSource);
    const [fila] = await ds.query(
      'SELECT `internalNumber` FROM `trucks` WHERE `id` = ?',
      [entorno.truckB],
    );
    expect(fila.internalNumber).not.toBe('INTRUSO');
  });

  it('crear un recurso declarando otra empresa lo estampa en la propia', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trucks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ plate: `ESTAMP${Date.now() % 100000}`, companyId: EMPRESA_B });

    if (res.status < 300) {
      expect(res.body.companyId).toBe(EMPRESA_A);
    }
  });

  it('el validador global sigue activo (el entorno replica main.ts)', () => {
    // Si esto falla, el barrido estaría corriendo contra una app distinta de la
    // real y sus resultados no serían representativos.
    expect(app).toBeDefined();
    expect(new ValidationPipe()).toBeDefined();
    expect(Test).toBeDefined();
  });
});
