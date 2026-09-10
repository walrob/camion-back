/**
 * Un Excel que baja del sistema tiene que poder volver a subirse.
 *
 * Es lo que promete la pantalla ("descargá, corregí en Excel, volvé a subir") y
 * lo que se rompe sin avisar en cuanto alguien renombra una columna de la
 * exportación y no toca la importación: el archivo pasa a fallar con "faltan
 * columnas obligatorias" y nadie se entera hasta que un usuario lo intenta.
 *
 * Acá se comparan los encabezados que escribe cada exportación contra los que
 * acepta su importación. Las columnas calculadas —estado, fecha de alta,
 * próximo vencimiento— sólo salen y no vuelven, y eso es correcto: se listan en
 * `SOLO_LECTURA` para que agregar una nueva sea una decisión explícita.
 */
import * as XLSX from 'xlsx';
import { FleetExcelService } from 'src/fleet/fleet-excel.service';
import { HrExcelService } from 'src/hr/hr-excel.service';
import { DriversExcelService } from 'src/drivers/drivers-excel.service';
import { DocumentsExcelService } from 'src/documents/documents-excel.service';
import { MaintenanceExcelService } from 'src/maintenance/maintenance-excel.service';
import { ImportColumn } from './excel-import.util';

const norm = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

/** Repositorio vacío: se ejercitan las columnas, no las consultas. */
const repo = () =>
  ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
  }) as any;

const catalogs = () =>
  ({
    etiquetas: jest.fn().mockResolvedValue({ driver: 'Chofer', seguro: 'Seguro' }),
  }) as any;

const svc = () =>
  ({ create: jest.fn(), update: jest.fn(), assign: jest.fn() }) as any;

function headersOf(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: '',
  });
  return (rows[0] ?? []).map(String).filter(Boolean);
}

/** Columnas que la exportación agrega y la carga ignora, por entidad. */
const SOLO_LECTURA: Record<string, string[]> = {
  Camiones: ['Alta'],
  Acoplados: ['Alta'],
  Flotas: ['Camiones', 'Alta'],
  Choferes: ['Email'],
  Empleados: ['Estado', 'Fecha de baja', 'Email'],
  Permisos: ['Empleado', 'Estado'],
  Asignaciones: ['Empleado', 'Desde', 'Hasta'],
  Documentos: ['Estado'],
  'Planes de mantenimiento': ['Proximo (km)', 'Proximo (fecha)'],
};

describe('Excel: ida y vuelta entre exportación e importación', () => {
  const fleet = new FleetExcelService(repo(), repo(), repo());
  const hr = new HrExcelService(
    repo(),
    repo(),
    repo(),
    repo(),
    svc(),
    svc(),
    svc(),
    catalogs(),
  );
  const drivers = new DriversExcelService(repo(), repo());
  const documents = new DocumentsExcelService(
    repo(),
    repo(),
    repo(),
    repo(),
    svc(),
    catalogs(),
  );
  const maintenance = new MaintenanceExcelService(
    repo(),
    repo(),
    repo(),
    svc(),
  );

  // `any` para llegar a los métodos privados de columnas: el test valida
  // justamente el contrato entre los dos lados, que no está expuesto.
  const cols = (service: any, method: string, ctx?: any): ImportColumn[] =>
    service[method](ctx);

  const casos: {
    nombre: string;
    exportar: () => Promise<Buffer>;
    columnas: () => ImportColumn[];
  }[] = [
    {
      nombre: 'Camiones',
      exportar: () => fleet.exportTrucks({}),
      columnas: () => cols(fleet, 'truckColumns'),
    },
    {
      nombre: 'Acoplados',
      exportar: () => fleet.exportTrailers({}),
      columnas: () => cols(fleet, 'trailerColumns'),
    },
    {
      nombre: 'Flotas',
      exportar: () => fleet.exportFleets({}),
      columnas: () => cols(fleet, 'fleetColumns'),
    },
    {
      nombre: 'Choferes',
      exportar: () => drivers.export({}),
      columnas: () => cols(drivers, 'columns'),
    },
    {
      nombre: 'Empleados',
      exportar: () => hr.exportEmployees({}),
      columnas: () =>
        cols(hr, 'employeeColumns', { posiciones: { driver: 'Chofer' } }),
    },
    {
      nombre: 'Permisos',
      exportar: () => hr.exportCertifications(),
      columnas: () =>
        cols(hr, 'certColumns', {
          empleados: new Map(),
          tipos: { lic: 'Carnet de conducir' },
        }),
    },
    {
      nombre: 'Asignaciones',
      exportar: () => hr.exportAssignments(),
      columnas: () => cols(hr, 'assignmentColumns'),
    },
    {
      nombre: 'Documentos',
      exportar: () => documents.export({}),
      columnas: () =>
        cols(documents, 'columns', {
          categorias: { seguro: 'Seguro' },
          camiones: new Map(),
          acoplados: new Map(),
          choferes: new Map(),
          etiquetaPorId: new Map(),
        }),
    },
    {
      nombre: 'Planes de mantenimiento',
      exportar: () => maintenance.exportPlans(),
      columnas: () => cols(maintenance, 'planColumns'),
    },
  ];

  it.each(casos)(
    '$nombre: la exportación trae todas las columnas obligatorias de la carga',
    async ({ nombre, exportar, columnas }) => {
      const exportados = new Set(headersOf(await exportar()).map(norm));

      const faltantes = columnas()
        .filter((c) => c.required)
        .filter((c) => {
          const candidatos = [c.header, ...(c.aliases ?? [])].map(norm);
          return !candidatos.some((x) => exportados.has(x));
        })
        .map((c) => c.header);

      expect({ nombre, faltantes }).toEqual({ nombre, faltantes: [] });
    },
  );

  it.each(casos)(
    '$nombre: las columnas que sólo salen son las declaradas',
    async ({ nombre, exportar, columnas }) => {
      const aceptados = new Set<string>();
      for (const c of columnas()) {
        aceptados.add(norm(c.header));
        (c.aliases ?? []).forEach((a) => aceptados.add(norm(a)));
      }

      const soloSalen = headersOf(await exportar())
        .filter((h) => !aceptados.has(norm(h)))
        .sort();

      expect(soloSalen).toEqual([...(SOLO_LECTURA[nombre] ?? [])].sort());
    },
  );
});
