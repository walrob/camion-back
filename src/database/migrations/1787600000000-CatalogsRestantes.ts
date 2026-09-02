import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los cinco catálogos que faltaban (cierre de la fase C, docs/CONFIGURACION.md §5).
 *
 * Libera del `enum` de MySQL las columnas que ahora define cada empresa:
 * categorías de documento, tipos de permiso, puestos, motivos de licencia y
 * tipos de combustible. Los valores existentes entran tal cual en el `varchar`,
 * así que no hay conversión de datos ni cambio de comportamiento.
 *
 * El `down` borra las filas con claves que el enum no conoce —las que haya
 * creado el cliente— porque es la única forma de que MySQL acepte revertir.
 * En `employees` y `employment_movements` no se borra la fila: se la lleva al
 * valor genérico, porque perder un legajo o un movimiento del historial laboral
 * por revertir una migración sería mucho peor que perder la precisión del dato.
 */
export class CatalogsRestantes1787600000000 implements MigrationInterface {
  name = 'CatalogsRestantes1787600000000';

  /** tabla → [columna, valores del enum original, valor de repliegue] */
  private static readonly COLUMNAS: [string, string, string[], string | null][] = [
    [
      'documents',
      'category',
      [
        'insurance',
        'vtv',
        'license',
        'id_card',
        'permit',
        'delivery_note',
        'waybill',
        'other',
      ],
      'other',
    ],
    [
      'certifications',
      'type',
      [
        'driving_license',
        'professional_license',
        'dangerous_goods',
        'medical_exam',
        'hazmat',
        'crane_operator',
        'defensive_driving',
        'first_aid',
        'other',
      ],
      'other',
    ],
    [
      'employees',
      'position',
      ['driver', 'mechanic', 'dispatcher', 'manager', 'admin', 'other'],
      'other',
    ],
    [
      'employment_movements',
      'leaveType',
      [
        'vacation',
        'sick',
        'work_accident',
        'parental',
        'unpaid',
        'study',
        'bereavement',
        'other',
      ],
      'other',
    ],
    ['fuel_records', 'fuelType', ['diesel', 'gasoline', 'gnc', 'adblue'], 'diesel'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [tabla, columna] of CatalogsRestantes1787600000000.COLUMNAS) {
      // `leaveType` es opcional (sólo las licencias lo llevan); el resto no.
      const nulable = columna === 'leaveType' ? 'NULL' : 'NOT NULL';
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` MODIFY \`${columna}\` varchar(64) ${nulable}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [
      tabla,
      columna,
      claves,
      repliegue,
    ] of CatalogsRestantes1787600000000.COLUMNAS) {
      const placeholders = claves.map(() => '?').join(', ');

      if (repliegue) {
        await queryRunner.query(
          `UPDATE \`${tabla}\` SET \`${columna}\` = ? ` +
            `WHERE \`${columna}\` IS NOT NULL AND \`${columna}\` NOT IN (${placeholders})`,
          [repliegue, ...claves],
        );
      }

      const nulable = columna === 'leaveType' ? 'NULL' : 'NOT NULL';
      // El tipo de una columna no admite parámetros: van literales. Son
      // constantes del código, no entrada de usuario.
      const literales = claves.map((c) => `'${c}'`).join(', ');
      await queryRunner.query(
        `ALTER TABLE \`${tabla}\` MODIFY \`${columna}\` enum(${literales}) ${nulable}`,
      );
    }
  }
}
