import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySetting } from './entities/company-setting.entity';
import {
  SETTING_BY_KEY,
  SETTING_DEFS,
  SETTING_GROUPS,
  SettingDef,
} from './settings.catalog';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(CompanySetting)
    private readonly settingsRepository: Repository<CompanySetting>,
    private readonly auditLog: AuditLogService,
  ) {}

  // ───────── Lectura ─────────

  /**
   * Valores efectivos de la empresa del contexto: el default del código, pisado
   * por lo que la empresa haya guardado.
   *
   * El repositorio es tenant-aware, así que `find()` ya trae sólo las filas de
   * esta empresa.
   */
  async all(): Promise<Record<string, string>> {
    const guardados = await this.settingsRepository.find();
    const valores: Record<string, string> = {};
    for (const def of SETTING_DEFS) {
      const fila = guardados.find((s) => s.key === def.key);
      valores[def.key] = fila?.value ?? def.default;
    }
    return valores;
  }

  /** Un valor puntual, ya resuelto contra el default. */
  async getString(key: string): Promise<string> {
    const def = SETTING_BY_KEY.get(key);
    if (!def) throw new BadRequestException(`Ajuste desconocido: ${key}`);
    const fila = await this.settingsRepository.findOne({ where: { key } });
    return fila?.value ?? def.default;
  }

  async getBoolean(key: string): Promise<boolean> {
    return (await this.getString(key)) === 'true';
  }

  async getNumber(key: string): Promise<number> {
    return Number(await this.getString(key));
  }

  /**
   * Lo que consume la pantalla: los grupos, cada ajuste con su metadato, su
   * valor efectivo y si ese valor es todavía el default.
   *
   * Que el front reciba la definición y no una lista fija de campos es lo que
   * hace que agregar un ajuste no sea un cambio de front.
   */
  async describe() {
    const valores = await this.all();
    return {
      groups: SETTING_GROUPS,
      settings: SETTING_DEFS.map((def) => ({
        ...def,
        value: valores[def.key],
        isDefault: valores[def.key] === def.default,
      })),
    };
  }

  // ───────── Escritura ─────────

  /**
   * Guarda los ajustes que cambiaron. Recibe el set completo o parcial: se
   * ignora lo que ya vale lo mismo, así la auditoría registra cambios reales y
   * no cada vez que alguien abrió la pantalla y apretó Guardar.
   */
  async update(values: Record<string, string>, user: ActiveUserInterface) {
    const actuales = await this.all();
    const cambios: Record<string, { de: string; a: string }> = {};

    for (const [key, crudo] of Object.entries(values)) {
      const def = SETTING_BY_KEY.get(key);
      if (!def) throw new BadRequestException(`Ajuste desconocido: ${key}`);

      const valor = this.normalizar(def, crudo);
      if (valor === actuales[key]) continue;

      // Se guarda incluso cuando coincide con el default: la fila documenta que
      // alguien lo decidió, y si mañana cambia el default de una versión, la
      // empresa que ya eligió ese valor no se ve arrastrada.
      let fila = await this.settingsRepository.findOne({ where: { key } });
      if (!fila) fila = this.settingsRepository.create({ key });
      fila.value = valor;
      fila.updatedBy = user.id;
      await this.settingsRepository.save(fila);

      cambios[key] = { de: actuales[key], a: valor };
    }

    if (Object.keys(cambios).length) {
      // Cambiar `blockOnExpiredDocs` o `allowReopen` es una decisión operativa,
      // no una preferencia de pantalla: tiene que poder contestarse quién y
      // cuándo.
      await this.auditLog.registrar(user, {
        action: AUDIT.SETTINGS_UPDATED,
        companyId: user.companyId,
        entityType: 'company_setting',
        entityId: null,
        metadata: { cambios },
      });
    }

    return this.describe();
  }

  /** Valida el valor contra el tipo declarado y lo deja en su forma canónica. */
  private normalizar(def: SettingDef, crudo: unknown): string {
    const texto = String(crudo ?? '').trim();

    switch (def.type) {
      case 'boolean': {
        if (texto !== 'true' && texto !== 'false') {
          throw new BadRequestException(
            `«${def.label}» sólo acepta verdadero o falso.`,
          );
        }
        return texto;
      }
      case 'number': {
        const n = Number(texto);
        if (!Number.isFinite(n)) {
          throw new BadRequestException(`«${def.label}» tiene que ser un número.`);
        }
        if (def.min != null && n < def.min) {
          throw new BadRequestException(
            `«${def.label}» no puede ser menor que ${def.min}.`,
          );
        }
        if (def.max != null && n > def.max) {
          throw new BadRequestException(
            `«${def.label}» no puede ser mayor que ${def.max}.`,
          );
        }
        return String(n);
      }
      case 'enum': {
        const valido = (def.options ?? []).some((o) => o.value === texto);
        if (!valido) {
          throw new BadRequestException(`«${def.label}» tiene un valor inválido.`);
        }
        return texto;
      }
      default: {
        if (!texto) {
          throw new BadRequestException(`«${def.label}» no puede quedar vacío.`);
        }
        if (def.maxLength != null && texto.length > def.maxLength) {
          throw new BadRequestException(
            `«${def.label}» no puede tener más de ${def.maxLength} caracteres.`,
          );
        }
        return texto;
      }
    }
  }
}
