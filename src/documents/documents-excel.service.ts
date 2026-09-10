import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Document } from './entities/document.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { Employee } from 'src/hr/entities/employee.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { DocumentsService } from './documents.service';
import { CatalogsService } from 'src/catalogs/catalogs.service';
import { CATALOG } from 'src/catalogs/catalogs.catalog';
import {
  DocumentOwnerType,
  DocumentStatus,
} from 'src/common/enums/document.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import {
  assertExportSize,
  buildImportTemplate,
  buildXlsx,
  cell,
  dateCell,
  ExcelRow,
  ImportColumn,
  ImportResult,
  runExcelImport,
} from 'src/common/excel';

const OWNER_TYPE_LABELS: Record<DocumentOwnerType, string> = {
  [DocumentOwnerType.TRUCK]: 'Camión',
  [DocumentOwnerType.TRAILER]: 'Acoplado',
  [DocumentOwnerType.DRIVER]: 'Chofer',
  [DocumentOwnerType.COMPANY]: 'Empresa',
};

const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.VALID]: 'Vigente',
  [DocumentStatus.EXPIRING]: 'Por vencer',
  [DocumentStatus.EXPIRED]: 'Vencido',
};

export interface DocumentExportFilters {
  ownerType?: DocumentOwnerType;
  ownerId?: string;
  category?: string;
}

/** Índices para resolver el dueño del documento desde la planilla. */
interface DocumentCtx {
  categorias: Record<string, string>;
  camiones: Map<string, string>;
  acoplados: Map<string, string>;
  /** DNI → id del chofer (no del legajo: el documento cuelga del Driver). */
  choferes: Map<string, string>;
  /** Para la exportación: id → texto que ve el usuario. */
  etiquetaPorId: Map<string, string>;
}

@Injectable()
export class DocumentsExcelService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    @InjectRepository(Trailer)
    private readonly trailersRepository: Repository<Trailer>,
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    private readonly documentsService: DocumentsService,
    private readonly catalogsService: CatalogsService,
  ) {}

  private async ctx(): Promise<DocumentCtx> {
    const [categorias, trucks, trailers, drivers] = await Promise.all([
      this.catalogsService.etiquetas(CATALOG.DOCUMENT_CATEGORY),
      this.trucksRepository.find(),
      this.trailersRepository.find(),
      this.driversRepository.find({ relations: ['employee'] }),
    ]);

    const etiquetaPorId = new Map<string, string>();
    trucks.forEach((t) => etiquetaPorId.set(t.id, t.plate));
    trailers.forEach((t) => etiquetaPorId.set(t.id, t.plate));
    drivers.forEach((d) =>
      etiquetaPorId.set(d.id, d.employee?.documentId ?? ''),
    );

    return {
      categorias,
      camiones: cell.indexBy(
        trucks,
        (t) => t.plate,
        (t) => t.id,
      ),
      acoplados: cell.indexBy(
        trailers,
        (t) => t.plate,
        (t) => t.id,
      ),
      choferes: cell.indexBy(
        drivers,
        (d: Driver & { employee?: Employee }) => d.employee?.documentId,
        (d) => d.id,
      ),
      etiquetaPorId,
    };
  }

  private columns(ctx: DocumentCtx): ImportColumn<DocumentCtx>[] {
    return [
      {
        header: 'Entidad',
        field: 'ownerType',
        required: true,
        parse: cell.enumLabel<DocumentOwnerType>(OWNER_TYPE_LABELS),
        hint: `Uno de: ${Object.values(OWNER_TYPE_LABELS).join(', ')}.`,
        example: 'Camión',
      },
      {
        header: 'Identificador',
        field: 'ownerRef',
        aliases: ['Patente / DNI', 'Patente', 'DNI'],
        parse: cell.text(40),
        hint: 'Patente si es Camión o Acoplado, DNI si es Chofer. Vacío si es Empresa.',
        example: 'AB123CD',
      },
      {
        header: 'Categoria',
        field: 'category',
        aliases: ['Categoría'],
        required: true,
        parse: cell.enumLabel(ctx.categorias),
        hint: `Una de: ${Object.values(ctx.categorias).join(', ')}.`,
        example: Object.values(ctx.categorias)[0] ?? 'Seguro',
      },
      {
        header: 'Numero',
        field: 'number',
        aliases: ['Número'],
        parse: cell.text(80),
        example: 'POL-556677',
      },
      {
        header: 'Emision',
        field: 'issueDate',
        aliases: ['Emisión', 'Fecha de emision'],
        parse: cell.date(),
        example: '01/01/2025',
      },
      {
        header: 'Vencimiento',
        field: 'expiryDate',
        aliases: ['Fecha de vencimiento'],
        parse: cell.date(),
        hint: 'De acá salen el estado del documento y los avisos por vencer.',
        example: '01/01/2026',
      },
    ];
  }

  /**
   * Resuelve el dueño y lo deja en `ownerId`.
   *
   * Va acá y no en el `parse` de la columna porque depende de dos celdas:
   * "AB123CD" es un camión o un acoplado según lo que diga Entidad, y para
   * Empresa no hay identificador que resolver.
   */
  private resolveOwner(row: any, ctx: DocumentCtx): string | void {
    if (row.ownerType === DocumentOwnerType.COMPANY) {
      row.ownerId = null;
      return;
    }
    if (!row.ownerRef) {
      return `Falta el Identificador: con Entidad "${OWNER_TYPE_LABELS[row.ownerType]}" hace falta la patente o el DNI.`;
    }

    const indices: Record<string, { mapa: Map<string, string>; queEs: string }> =
      {
        [DocumentOwnerType.TRUCK]: { mapa: ctx.camiones, queEs: 'el camión' },
        [DocumentOwnerType.TRAILER]: {
          mapa: ctx.acoplados,
          queEs: 'el acoplado',
        },
        [DocumentOwnerType.DRIVER]: { mapa: ctx.choferes, queEs: 'el chofer' },
      };

    const { mapa, queEs } = indices[row.ownerType];
    const clave = String(row.ownerRef)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // Las patentes se indexan sin separadores; el DNI no los tiene.
      .replace(/[\s-]/g, '');

    const id =
      mapa.get(clave) ??
      // El DNI se indexa tal cual se cargó, sin sacarle separadores.
      mapa.get(
        String(row.ownerRef).trim().toLowerCase(),
      );

    if (!id) return `No existe ${queEs} "${String(row.ownerRef).trim()}".`;
    row.ownerId = id;
  }

  async export(filters: DocumentExportFilters): Promise<Buffer> {
    const where: FindOptionsWhere<Document> = {
      ...(filters.ownerType && { ownerType: filters.ownerType }),
      ...(filters.ownerId && { ownerId: filters.ownerId }),
      ...(filters.category && { category: filters.category }),
    };
    assertExportSize(await this.documentsRepository.count({ where }));

    const [docs, ctx] = await Promise.all([
      this.documentsRepository.find({ where, order: { expiryDate: 'ASC' } }),
      this.ctx(),
    ]);

    const columns = [
      'Entidad',
      'Identificador',
      'Categoria',
      'Numero',
      'Emision',
      'Vencimiento',
      'Estado',
    ];

    const rows: ExcelRow[] = docs.map((d) => ({
      Entidad: OWNER_TYPE_LABELS[d.ownerType] ?? d.ownerType,
      Identificador: d.ownerId ? (ctx.etiquetaPorId.get(d.ownerId) ?? '') : '',
      Categoria: ctx.categorias[d.category] ?? d.category,
      Numero: d.number ?? '',
      Emision: dateCell(d.issueDate),
      Vencimiento: dateCell(d.expiryDate),
      Estado: DOC_STATUS_LABELS[d.status] ?? d.status,
    }));

    return buildXlsx('Documentos', columns, rows);
  }

  async template(): Promise<Buffer> {
    return buildImportTemplate('Documentos', this.columns(await this.ctx()));
  }

  async import(
    buffer: Buffer,
    user: ActiveUserInterface,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const ctx = await this.ctx();

    return runExcelImport<any, DocumentCtx>({
      buffer,
      dryRun,
      columns: this.columns(ctx),
      ctx,
      validate: (row) => this.resolveOwner(row, ctx),
      // Un documento por dueño y categoría: la renovación actualiza el
      // vencimiento en vez de apilar una fila cada vez que se sube la planilla.
      key: (row) => `${row.ownerType}|${row.ownerId ?? ''}|${row.category}`,
      find: async (key) => {
        const [ownerType, ownerId, category] = key.split('|');
        return this.documentsRepository.findOne({
          where: {
            ownerType: ownerType as DocumentOwnerType,
            ownerId: ownerId || (null as any),
            category,
          },
        });
      },
      // Vía servicio: valida la categoría contra el catálogo de la empresa y
      // recalcula el estado con la ventana de aviso configurada.
      create: ({ ownerRef, ...dto }) =>
        this.documentsService.create(dto, undefined, user),
      update: (existing: Document, { ownerRef, ...dto }) =>
        this.documentsService.update(existing.id, dto, undefined, user),
    });
  }
}
