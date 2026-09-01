import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gating por plan de la configuración (fases A y B de docs/CONFIGURACION.md).
 *
 * Que el sistema sea adaptable no lo saca del modelo comercial: configurar es
 * una capacidad más y entra donde dice la matriz de MODELO-COMERCIAL §4.1.
 *
 * | Feature | Desde | Qué habilita |
 * |---|---|---|
 * | `settings` | Operación | Cambiar los ajustes de operación |
 * | `checklist_templates` | Operación | Armar la plantilla propia del checklist |
 * | `checklist_by_type` | Gestión | Tener una plantilla por tipo de unidad |
 *
 * **Control no pierde nada**: nunca pudo configurar, y sigue operando con los
 * valores por defecto. Leer la configuración efectiva no se gatea —la app del
 * chofer la necesita para saber qué se le va a exigir—; lo que se gatea es
 * cambiarla.
 *
 * Las features se agregan a los planes existentes en la base, que es donde vive
 * el mapa (el seed original ya corrió en las instalaciones).
 */
export class ConfigFeatures1787400000000 implements MigrationInterface {
  name = 'ConfigFeatures1787400000000';

  private static readonly POR_PLAN: Record<string, string[]> = {
    operacion: ['settings', 'checklist_templates'],
    gestion: ['settings', 'checklist_templates', 'checklist_by_type'],
    corporate: ['settings', 'checklist_templates', 'checklist_by_type'],
    // El plan de la instalación original tiene todas las features (decisión D2).
    legacy: ['settings', 'checklist_templates', 'checklist_by_type'],
  };

  /** Aplica un cambio sobre el array de features de un plan. */
  private async actualizar(
    queryRunner: QueryRunner,
    code: string,
    cambiar: (features: string[]) => string[],
  ): Promise<void> {
    const filas: { id: string; features: string | null }[] =
      await queryRunner.query(
        'SELECT `id`, `features` FROM `plans` WHERE `code` = ?',
        [code],
      );
    if (!filas.length) return;

    for (const fila of filas) {
      let actuales: string[] = [];
      try {
        actuales = fila.features ? JSON.parse(fila.features) : [];
      } catch {
        // Un plan con el JSON roto no se toca: se arregla a mano, no en silencio.
        continue;
      }
      await queryRunner.query('UPDATE `plans` SET `features` = ? WHERE `id` = ?', [
        JSON.stringify(cambiar(actuales)),
        fila.id,
      ]);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, nuevas] of Object.entries(
      ConfigFeatures1787400000000.POR_PLAN,
    )) {
      await this.actualizar(queryRunner, code, (actuales) => [
        ...new Set([...actuales, ...nuevas]),
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [code, nuevas] of Object.entries(
      ConfigFeatures1787400000000.POR_PLAN,
    )) {
      await this.actualizar(queryRunner, code, (actuales) =>
        actuales.filter((f) => !nuevas.includes(f)),
      );
    }
  }
}
