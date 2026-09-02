import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogItem } from './entities/catalog-item.entity';
import {
  BEHAVIOR,
  CATALOG,
  CATALOG_BY_KEY,
  CATALOG_DEFS,
  CatalogDef,
  esDeSistema,
} from './catalogs.catalog';
import { SaveCatalogDto } from './dto/save-catalog.dto';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';

/** Un elemento resuelto, ya sea de sistema o propio de la empresa. */
export interface ElementoDeCatalogo {
  key: string;
  label: string;
  color?: string;
  icon?: string;
  order: number;
  behavior?: string;
  isActive: boolean;
  /** Los de sistema se renombran y desactivan, no se eliminan. */
  isSystem: boolean;
}

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(CatalogItem)
    private readonly itemsRepository: Repository<CatalogItem>,
    private readonly auditLog: AuditLogService,
  ) {}

  // ───────── Lectura ─────────

  /**
   * Los elementos de un catálogo: los de sistema pisados por lo que la empresa
   * haya cambiado, más los que agregó ella.
   */
  async items(catalog: string): Promise<ElementoDeCatalogo[]> {
    const def = CATALOG_BY_KEY.get(catalog);
    if (!def) throw new BadRequestException(`Catálogo desconocido: ${catalog}`);

    const guardados = await this.itemsRepository.find({ where: { catalog } });

    const deSistema: ElementoDeCatalogo[] = def.items.map((item, i) => {
      const propio = guardados.find((g) => g.key === item.key);
      return {
        key: item.key,
        label: propio?.label ?? item.label,
        color: propio?.color ?? item.color,
        icon: propio?.icon ?? item.icon,
        order: propio?.order ?? i,
        // El comportamiento de un elemento de sistema no se toca: es lo que el
        // código hace con él.
        behavior: item.behavior,
        isActive: propio?.isActive ?? true,
        isSystem: true,
      };
    });

    const propios: ElementoDeCatalogo[] = guardados
      .filter((g) => !esDeSistema(catalog, g.key))
      .map((g) => ({
        key: g.key,
        label: g.label,
        color: g.color ?? undefined,
        icon: g.icon ?? undefined,
        order: g.order,
        behavior: g.behavior ?? undefined,
        isActive: g.isActive,
        isSystem: false,
      }));

    return [...deSistema, ...propios].sort((a, b) => a.order - b.order);
  }

  /** Todos los catálogos de una sola vez: es como los pide el front. */
  async all() {
    const salida: Record<string, ElementoDeCatalogo[]> = {};
    for (const def of CATALOG_DEFS) salida[def.key] = await this.items(def.key);
    return {
      catalogs: CATALOG_DEFS.map(({ key, label, help, comportamiento }) => ({
        key,
        label,
        help,
        // La pantalla dibuja el selector de comportamiento con esto: no conoce
        // ningún catálogo en particular.
        comportamiento: comportamiento ?? null,
      })),
      items: salida,
    };
  }

  /**
   * Rol de acceso que le corresponde a un puesto.
   *
   * Lo usa RRHH al crear el usuario de un empleado. Un puesto propio del cliente
   * —«Playero», «Encargado de patio»— trae el rol que eligió al crearlo; si no
   * eligió ninguno, el del catálogo por defecto.
   */
  async rolDePuesto(position?: string): Promise<string> {
    const def = CATALOG_BY_KEY.get(CATALOG.EMPLOYEE_POSITION);
    const porDefecto = def?.comportamiento?.porDefecto ?? 'driver';
    if (!position) return porDefecto;

    const items = await this.items(CATALOG.EMPLOYEE_POSITION);
    return items.find((i) => i.key === position)?.behavior ?? porDefecto;
  }

  /**
   * Verifica que una clave exista en el catálogo y esté activa.
   *
   * Reemplaza a los `@IsEnum` de los DTOs: la lista dejó de estar en el código.
   */
  async assertVigente(catalog: string, key: string, queEs: string): Promise<void> {
    const item = (await this.items(catalog)).find((i) => i.key === key);
    if (!item) {
      throw new BadRequestException(`${queEs} desconocido: ${key}`);
    }
    if (!item.isActive) {
      throw new BadRequestException(
        `«${item.label}» está desactivado en la configuración de tu empresa.`,
      );
    }
  }

  /**
   * ¿Este tipo de gasto resta en la rendición?
   *
   * Lo consultan liquidaciones y la bitácora. Un tipo que la empresa creó y no
   * marcó como adelanto suma, que es el default seguro.
   */
  async esAdelanto(catalog: string, key: string): Promise<boolean> {
    const items = await this.items(catalog);
    return items.find((i) => i.key === key)?.behavior === BEHAVIOR.ADVANCE;
  }

  /** Etiquetas por clave, para exportaciones y PDFs. */
  async etiquetas(catalog: string): Promise<Record<string, string>> {
    const items = await this.items(catalog);
    return Object.fromEntries(items.map((i) => [i.key, i.label]));
  }

  // ───────── Escritura ─────────

  /**
   * Guarda el catálogo completo tal como se edita en pantalla: llegan todos los
   * elementos, en su orden, y lo que no está en la lista se desactiva.
   */
  async save(
    catalog: string,
    dto: SaveCatalogDto,
    user: ActiveUserInterface,
  ): Promise<ElementoDeCatalogo[]> {
    const def = CATALOG_BY_KEY.get(catalog);
    if (!def) throw new BadRequestException(`Catálogo desconocido: ${catalog}`);

    const claves = dto.items.map((i) => i.key);
    if (new Set(claves).size !== claves.length) {
      throw new BadRequestException(
        'Hay elementos con la misma clave: cada uno tiene que tener una distinta.',
      );
    }

    // Ningún elemento de sistema puede desaparecer: el histórico lo referencia
    // y el código lo espera. Se desactiva, que es lo que se ofrece en pantalla.
    const faltantes = def.items
      .map((i) => i.key)
      .filter((k) => !claves.includes(k));
    if (faltantes.length) {
      throw new BadRequestException(
        'Los elementos que trae el sistema no se pueden eliminar: desactivalos si no los usás.',
      );
    }

    const guardados = await this.itemsRepository.find({ where: { catalog } });

    for (const [i, item] of dto.items.entries()) {
      const sistema = esDeSistema(catalog, item.key);

      let fila = guardados.find((g) => g.key === item.key);
      if (!fila) fila = this.itemsRepository.create({ catalog, key: item.key });

      fila.label = item.label;
      fila.color = item.color ?? null;
      fila.icon = item.icon ?? null;
      fila.order = i;
      fila.isActive = item.isActive ?? true;
      // El comportamiento sólo se acepta en catálogos que lo declaran y en
      // elementos propios: el de un elemento de sistema es parte del producto.
      fila.behavior =
        def.comportamiento && !sistema
          ? this.normalizarComportamiento(def, item.behavior)
          : null;
      fila.updatedBy = user.id;

      await this.itemsRepository.save(fila);
    }

    // Los propios que la empresa sacó de la lista se desactivan, no se borran:
    // los viajes del año pasado los siguen nombrando.
    for (const fila of guardados) {
      if (claves.includes(fila.key) || !fila.isActive) continue;
      fila.isActive = false;
      fila.updatedBy = user.id;
      await this.itemsRepository.save(fila);
    }

    await this.auditLog.registrar(user, {
      action: AUDIT.CATALOG_UPDATED,
      companyId: user.companyId,
      entityType: 'catalog',
      entityId: null,
      metadata: { catalog, elementos: claves.length },
    });

    return this.items(catalog);
  }

  /**
   * El comportamiento tiene que ser uno de los que declara el catálogo. Sin
   * valor se aplica el por defecto: un tipo de gasto sin marcar suma, y un
   * puesto sin rol entra como chofer.
   */
  private normalizarComportamiento(def: CatalogDef, valor?: string): string {
    const { porDefecto, opciones } = def.comportamiento!;
    if (!valor) return porDefecto;
    if (!opciones.some((o) => o.value === valor)) {
      throw new BadRequestException(
        `«${valor}» no es un valor válido para ${def.comportamiento!.label.toLowerCase()}.`,
      );
    }
    return valor;
  }
}
