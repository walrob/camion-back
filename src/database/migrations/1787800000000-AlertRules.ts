import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reglas del motor de alertas (fase E de docs/CONFIGURACION.md §6.3).
 *
 * **Corrección al plan**: `docs/CONFIGURACION.md` preveía absorber los umbrales
 * en `CompanySetting`. No se hizo, y a propósito: el límite comercial del plan
 * —3 reglas en Control, 10 en Operación, ilimitadas en Gestión— se cuenta sobre
 * las filas de `alert_rule_configs` y ya está enforced (`LimitsService`).
 * Fusionarlas en ajustes sueltos habría roto un límite vendido. Lo que faltaba
 * no era mudarlas de tabla: era darles un **catálogo** y una pantalla.
 *
 * Esta migración sólo **renombra las claves** a las del catálogo. No hay cambio
 * de esquema ni de comportamiento: una empresa sin filas sigue operando con los
 * mismos valores por defecto de siempre.
 */
export class AlertRules1787800000000 implements MigrationInterface {
  name = 'AlertRules1787800000000';

  /** clave vieja → clave del catálogo. */
  private static readonly RENOMBRES: [string, string][] = [
    ['expenseAmountThreshold', 'expense.overThreshold'],
    ['idleHoursThreshold', 'truck.idle'],
    ['expiryWarningDays', 'document.expiring'],
    ['maintenanceKmThreshold', 'maintenance.kmAhead'],
    ['maintenanceDaysThreshold', 'maintenance.daysAhead'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [vieja, nueva] of AlertRules1787800000000.RENOMBRES) {
      // Si una empresa ya tuviera la clave nueva, se descarta la vieja: el
      // índice único (companyId, key) rechazaría el update.
      await queryRunner.query(
        'DELETE FROM `alert_rule_configs` WHERE `key` = ? AND `companyId` IN ' +
          '(SELECT * FROM (SELECT `companyId` FROM `alert_rule_configs` WHERE `key` = ?) AS x)',
        [vieja, nueva],
      );
      await queryRunner.query(
        'UPDATE `alert_rule_configs` SET `key` = ? WHERE `key` = ?',
        [nueva, vieja],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [vieja, nueva] of AlertRules1787800000000.RENOMBRES) {
      await queryRunner.query(
        'UPDATE `alert_rule_configs` SET `key` = ? WHERE `key` = ?',
        [vieja, nueva],
      );
    }
    // Las reglas que no existían antes del catálogo no tienen clave vieja a la
    // que volver: se borran para no dejar filas que nadie va a leer.
    await queryRunner.query(
      "DELETE FROM `alert_rule_configs` WHERE `key` IN ('certification.expiring', 'incident.reported', 'employment.leaveAssignment')",
    );
  }
}
