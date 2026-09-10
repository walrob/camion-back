import * as XLSX from 'xlsx';
import {
  buildImportTemplate,
  ImportColumn,
  runExcelImport,
} from './excel-import.util';
import * as cell from './excel-cell.util';

const columns: ImportColumn<any>[] = [
  { header: 'Patente', field: 'plate', required: true, parse: cell.plate() },
  {
    header: 'Año',
    field: 'year',
    parse: cell.number({ int: true, min: 1900, max: 2100 }),
  },
  { header: 'Vence', field: 'expiry', parse: cell.date() },
  { header: 'Capacidad (kg)', field: 'kg', parse: cell.number({ min: 0 }) },
  { header: 'Activo', field: 'ok', parse: cell.bool() },
  {
    header: 'Estado',
    field: 'status',
    parse: cell.enumLabel({ available: 'Disponible', workshop: 'En taller' }),
  },
];

/** Arma un xlsx en memoria a partir de una matriz de celdas. */
function hoja(rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Hoja1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('runExcelImport', () => {
  it('acepta encabezados en cualquier orden, sin tildes y con alias', async () => {
    const creados: any[] = [];
    const r = await runExcelImport({
      // "activo" primero, "ano" sin tilde, "PATENTE" en mayúsculas: es lo que
      // llega cuando la planilla la armó otra persona en otra computadora.
      buffer: hoja([
        ['activo', 'PATENTE', 'ano', 'Vence', 'Capacidad (kg)', 'Estado'],
        ['Si', 'ab 123 cd', '2021', '31/12/2026', '1.234,50', 'En taller'],
        ['No', 'ABC123', '1999', '2026-01-05', '900', 'Disponible'],
        ['', '', '', '', '', ''],
      ]),
      columns,
      create: async (row) => void creados.push(row),
    });

    expect(r.errores).toEqual([]);
    expect(r).toMatchObject({ procesadas: 2, creados: 2 });
    expect(creados[0]).toEqual({
      plate: 'AB123CD',
      year: 2021,
      // "1.234,50" en formato es-AR, no mil doscientos treinta y cuatro mil.
      kg: 1234.5,
      expiry: '2026-12-31',
      ok: true,
      status: 'workshop',
    });
    expect(creados[1]).toMatchObject({ expiry: '2026-01-05', ok: false });
  });

  it('junta los errores de todas las filas y no escribe ninguna', async () => {
    const create = jest.fn();
    const r = await runExcelImport({
      buffer: hoja([
        ['Patente', 'Año', 'Vence', 'Estado'],
        ['', '2021', '31/12/2026', 'Disponible'],
        ['AB123CD', 'dos mil', '31/02/2026', 'Volando'],
      ]),
      columns,
      create,
    });

    expect(create).not.toHaveBeenCalled();
    expect(r.creados).toBe(0);
    expect(r.errores).toEqual([
      { fila: 2, columna: 'Patente', motivo: 'Dato obligatorio.' },
      { fila: 3, columna: 'Año', motivo: 'Tiene que ser un número.' },
      { fila: 3, columna: 'Vence', motivo: 'Esa fecha no existe.' },
      {
        fila: 3,
        columna: 'Estado',
        motivo: 'Valor inválido. Opciones: Disponible, En taller.',
      },
    ]);
  });

  it('detecta la misma clave repetida dentro del archivo', async () => {
    const r = await runExcelImport({
      // La patente se normaliza antes de comparar: "ab-123-cd" es la misma.
      buffer: hoja([['Patente'], ['AB123CD'], ['ab-123-cd']]),
      columns,
      key: (row: any) => row.plate,
      create: jest.fn(),
    });

    expect(r.errores).toEqual([
      { fila: 3, motivo: '"AB123CD" ya aparece en la fila 2 del archivo.' },
    ]);
  });

  it('rechaza el archivo si falta una columna obligatoria', async () => {
    await expect(
      runExcelImport({
        buffer: hoja([['Año'], ['2021']]),
        columns,
        create: jest.fn(),
      }),
    ).rejects.toThrow(/Faltan columnas obligatorias.*Patente/s);
  });

  it('con dryRun cuenta lo que pasaría pero no escribe', async () => {
    const create = jest.fn();
    const r = await runExcelImport({
      buffer: hoja([['Patente'], ['AB123CD']]),
      columns,
      dryRun: true,
      create,
    });

    expect(create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ creados: 1, simulacion: true });
  });

  it('actualiza en lugar de duplicar cuando la clave ya existe', async () => {
    const update = jest.fn();
    const r = await runExcelImport({
      buffer: hoja([['Patente'], ['AB123CD']]),
      columns,
      key: (row: any) => row.plate,
      find: async () => ({ id: 'ya-existe' }),
      create: jest.fn(),
      update,
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ creados: 0, actualizados: 1 });
  });

  it('omite la fila existente cuando la entidad no admite actualización', async () => {
    const r = await runExcelImport({
      buffer: hoja([['Patente'], ['AB123CD']]),
      columns,
      key: (row: any) => row.plate,
      find: async () => ({ id: 'ya-existe' }),
      create: jest.fn(),
      // Sin `update`: es el caso de las asignaciones vigentes.
    });

    expect(r).toMatchObject({ creados: 0, actualizados: 0, omitidos: 1 });
  });

  it('si falla un guardado corta ahí e informa lo que sí se escribió', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Ya existe un camión con esa patente.'));

    const r = await runExcelImport({
      buffer: hoja([['Patente'], ['AB123CD'], ['CD456EF'], ['EF789GH']]),
      columns,
      create,
    });

    // La cuarta fila no se intenta: el corte es limpio en una fila conocida.
    expect(create).toHaveBeenCalledTimes(2);
    // Y no se miente con "0 creados": la primera fila entró de verdad.
    expect(r).toMatchObject({ creados: 1, interrumpido: true });
    expect(r.errores).toEqual([
      { fila: 3, motivo: 'Ya existe un camión con esa patente.' },
    ]);
  });

  it('un error de validación no marca la carga como interrumpida', async () => {
    const r = await runExcelImport({
      buffer: hoja([['Patente'], ['no-es-patente']]),
      columns,
      create: jest.fn(),
    });

    expect(r).toMatchObject({ creados: 0, interrumpido: false });
    expect(r.errores).toHaveLength(1);
  });
});

describe('buildImportTemplate', () => {
  it('trae la hoja de datos y la de instrucciones', () => {
    const wb = XLSX.read(buildImportTemplate('Camiones', columns), {
      type: 'buffer',
    });
    expect(wb.SheetNames).toEqual(['Camiones', 'Instrucciones']);
  });
});

describe('conversores de celda', () => {
  it('interpreta números en formato es-AR y en inglés', () => {
    const n = cell.number();
    expect(n('1.234,50')).toBe(1234.5);
    expect(n('1,234.50')).toBe(1234.5);
    expect(n('1.234')).toBe(1234);
    expect(n('1234')).toBe(1234);
    expect(n('0,5')).toBe(0.5);
    expect(() => n('mil')).toThrow();
  });

  it('interpreta fechas dd/mm/aaaa, ISO y seriales de Excel', () => {
    const d = cell.date();
    expect(d('31/12/2026')).toBe('2026-12-31');
    expect(d('1-2-2026')).toBe('2026-02-01');
    expect(d('2026-03-04')).toBe('2026-03-04');
    // Serial de Excel: llega cuando la celda quedó formateada como número.
    // 44927 = 01/01/2023 y 45000 son 73 días más, o sea el 15/03/2023.
    expect(d('44927')).toBe('2023-01-01');
    expect(d('45000')).toBe('2023-03-15');
    expect(() => d('31/02/2026')).toThrow(/no existe/);
    expect(() => d('ayer')).toThrow();
  });

  it('acepta las formas en que la gente escribe sí y no', () => {
    const b = cell.bool();
    expect([b('Sí'), b('si'), b('X'), b('1'), b('TRUE')]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([b('No'), b('0'), b('false')]).toEqual([false, false, false]);
    expect(() => b('quizás')).toThrow();
  });

  it('resuelve la etiqueta o la clave cruda de un enum', () => {
    const e = cell.enumLabel({ available: 'Disponible', workshop: 'En taller' });
    expect(e('en taller')).toBe('workshop');
    expect(e('EN TALLER')).toBe('workshop');
    expect(e('workshop')).toBe('workshop');
    expect(() => e('en el taller')).toThrow(/Opciones/);
  });

  it('normaliza patentes y avisa cuando no lo son', () => {
    const p = cell.plate();
    expect(p(' ab-123 cd ')).toBe('AB123CD');
    expect(() => p('AB1')).toThrow(/Patente inválida/);
  });

  it('resuelve referencias a otra entidad ignorando tildes y mayúsculas', () => {
    const ctx = {
      mapa: cell.indexBy(
        [{ id: 'x', name: 'Flota Único' }],
        (f) => f.name,
        (f) => f.id,
      ),
    };
    const l = cell.lookup<typeof ctx>((c) => c.mapa, 'la flota');
    expect(l('flota unico', ctx)).toBe('x');
    expect(() => l('Flota Norte', ctx)).toThrow(/No existe la flota/);
  });
});
