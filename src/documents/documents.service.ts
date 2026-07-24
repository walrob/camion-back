import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  LessThanOrEqual,
  Not,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as XLSX from 'xlsx';
import { dateOnly } from 'src/common/pdf/pdf-report.util';
import { Document } from './entities/document.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Trailer } from 'src/fleet/entities/trailer.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import {
  DocumentCategory,
  DocumentOwnerType,
  DocumentStatus,
} from 'src/common/enums/document.enum';
import { AlertLevel, AlertSourceType } from 'src/common/enums/alert.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { StorageService } from 'src/common/storage/storage.service';
import { AlertsService } from 'src/alerts/alerts.service';
import { DriversService } from 'src/drivers/drivers.service';

const WARNING_DAYS = 30;

// Etiquetas en español para la exportación (idénticas a las del front).
const OWNER_TYPE_LABELS: Record<string, string> = {
  truck: 'Camión',
  trailer: 'Acoplado',
  driver: 'Chofer',
  company: 'Empresa',
};
const CATEGORY_LABELS: Record<string, string> = {
  insurance: 'Seguro',
  vtv: 'VTV',
  license: 'Licencia',
  id_card: 'Carnet / DNI',
  permit: 'Habilitación',
  delivery_note: 'Remito',
  waybill: 'Carta de porte',
  other: 'Otro',
};
const DOC_STATUS_LABELS: Record<string, string> = {
  valid: 'Vigente',
  expiring: 'Por vencer',
  expired: 'Vencido',
};

export interface DocumentOwner {
  type: DocumentOwnerType;
  id: string | null;
  label?: string;
  /** Dato secundario: tipo de licencia (chofer), marca/modelo (camión), tipo (acoplado). */
  sublabel?: string | null;
  /** Solo para choferes: para poder mandarle un mensaje. */
  userId?: string | null;
  /** Solo para choferes: para llamar/WhatsApp. */
  phone?: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    @InjectRepository(Trailer)
    private readonly trailersRepository: Repository<Trailer>,
    private readonly storageService: StorageService,
    private readonly alertsService: AlertsService,
    private readonly driversService: DriversService,
  ) {}

  computeStatus(expiryDate?: string | null): DocumentStatus {
    if (!expiryDate) return DocumentStatus.VALID;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    const warn = new Date(today);
    warn.setDate(warn.getDate() + WARNING_DAYS);
    if (expiry < today) return DocumentStatus.EXPIRED;
    if (expiry <= warn) return DocumentStatus.EXPIRING;
    return DocumentStatus.VALID;
  }

  async create(
    dto: CreateDocumentDto,
    file: Express.Multer.File | undefined,
    user: ActiveUserInterface,
  ): Promise<Document> {
    const fileKey = file
      ? await this.storageService.uploadFile(file, 'documents')
      : undefined;

    const document = this.documentsRepository.create({
      ...dto,
      fileKey,
      status: this.computeStatus(dto.expiryDate),
      createdBy: user.id,
    });
    return this.documentsRepository.save(document);
  }

  listByOwner(
    ownerType: DocumentOwnerType,
    ownerId?: string,
    category?: DocumentCategory,
  ): Promise<Document[]> {
    return this.documentsRepository.find({
      where: {
        ownerType,
        ...(ownerId && { ownerId }),
        ...(category && { category }),
      },
      order: { expiryDate: 'ASC' },
    });
  }

  async expiring(days = WARNING_DAYS): Promise<Array<Document & { owner: DocumentOwner }>> {
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    const docs = await this.documentsRepository.find({
      where: {
        expiryDate: LessThanOrEqual(limit.toISOString().slice(0, 10)),
        status: Not(DocumentStatus.VALID),
      },
      order: { expiryDate: 'ASC' },
    });

    // Resolvemos los dueños en lote (documento es polimórfico: ownerType/ownerId).
    const idsOf = (t: DocumentOwnerType) => [
      ...new Set(
        docs
          .filter((d) => d.ownerType === t && d.ownerId)
          .map((d) => d.ownerId),
      ),
    ];

    const [trucks, trailers, drivers] = await Promise.all([
      this.findByIdsSafe(this.trucksRepository, idsOf(DocumentOwnerType.TRUCK)),
      this.findByIdsSafe(
        this.trailersRepository,
        idsOf(DocumentOwnerType.TRAILER),
      ),
      this.driversService.findByIds(idsOf(DocumentOwnerType.DRIVER)),
    ]);

    const truckMap = new Map(trucks.map((t) => [t.id, t]));
    const trailerMap = new Map(trailers.map((t) => [t.id, t]));
    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    return docs.map((d) => ({ ...d, owner: this.buildOwner(d, {
      truckMap,
      trailerMap,
      driverMap,
    }) }));
  }

  /** Exporta a Excel los documentos por vencer / vencidos. */
  async exportExpiringXlsx(days = WARNING_DAYS): Promise<Buffer> {
    const docs = await this.expiring(days);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        docs.map((d) => ({
          Entidad: OWNER_TYPE_LABELS[d.ownerType] ?? d.ownerType,
          Dueño: d.owner?.label ?? '-',
          Detalle: d.owner?.sublabel ?? '',
          Categoria: CATEGORY_LABELS[d.category] ?? d.category,
          Numero: d.number ?? '',
          Emision: dateOnly(d.issueDate),
          Vencimiento: dateOnly(d.expiryDate),
          Estado: DOC_STATUS_LABELS[d.status] ?? d.status,
        })),
      ),
      'Vencimientos',
    );
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  private findByIdsSafe<T extends ObjectLiteral>(
    repo: Repository<T>,
    ids: string[],
  ): Promise<T[]> {
    if (!ids.length) return Promise.resolve([]);
    return repo.find({ where: { id: In(ids) } as any });
  }

  private buildOwner(
    doc: Document,
    maps: {
      truckMap: Map<string, Truck>;
      trailerMap: Map<string, Trailer>;
      driverMap: Map<string, any>;
    },
  ): DocumentOwner {
    const base: DocumentOwner = {
      type: doc.ownerType,
      id: doc.ownerId ?? null,
    };
    if (doc.ownerType === DocumentOwnerType.TRUCK) {
      const t = maps.truckMap.get(doc.ownerId);
      return {
        ...base,
        label: t?.plate ?? 'Camión',
        sublabel:
          [t?.brand, t?.model].filter(Boolean).join(' ') ||
          t?.internalNumber ||
          null,
      };
    }
    if (doc.ownerType === DocumentOwnerType.TRAILER) {
      const t = maps.trailerMap.get(doc.ownerId);
      return { ...base, label: t?.plate ?? 'Acoplado', sublabel: t?.type ?? null };
    }
    if (doc.ownerType === DocumentOwnerType.DRIVER) {
      const dr = maps.driverMap.get(doc.ownerId);
      const emp = dr?.employee;
      return {
        ...base,
        label: emp
          ? `${emp.firstName} ${emp.lastName}`.trim()
          : (dr?.licenseNumber ?? 'Chofer'),
        sublabel: dr?.licenseType ?? null,
        userId: emp?.user?.id ?? null,
        phone: emp?.phone ?? null,
      };
    }
    return { ...base, label: 'Empresa' };
  }

  async findForDriver(userId: string, truckId?: string): Promise<Document[]> {
    const driver = await this.driversService.findByUserId(userId);
    const qb = this.documentsRepository
      .createQueryBuilder('d')
      .where(
        '(d.ownerType = :driver AND d.ownerId = :driverId)',
        { driver: DocumentOwnerType.DRIVER, driverId: driver.id },
      );
    if (truckId) {
      qb.orWhere('(d.ownerType = :truck AND d.ownerId = :truckId)', {
        truck: DocumentOwnerType.TRUCK,
        truckId,
      });
    }
    return qb.orderBy('d.expiryDate', 'ASC').getMany();
  }

  async findOne(id: string): Promise<Document> {
    const document = await this.documentsRepository.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Documento no encontrado.');
    return document;
  }

  async getFileUrl(id: string): Promise<{ url: string }> {
    const document = await this.findOne(id);
    if (!document.fileKey) return { url: '' };
    const url = await this.storageService.getPresignedUrl(document.fileKey, 300);
    return { url };
  }

  async update(
    id: string,
    dto: UpdateDocumentDto,
    file: Express.Multer.File | undefined,
    user: ActiveUserInterface,
  ): Promise<Document> {
    const document = await this.findOne(id);
    if (file) {
      document.fileKey = await this.storageService.uploadFile(file, 'documents');
    }
    Object.assign(document, dto, { updatedBy: user.id });
    document.status = this.computeStatus(document.expiryDate);
    return this.documentsRepository.save(document);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const document = await this.findOne(id);
    document.deletedBy = user.id;
    await this.documentsRepository.save(document);
    return this.documentsRepository.softDelete(id);
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async recalculateStatuses(): Promise<void> {
    const all = await this.documentsRepository.find();
    for (const doc of all) {
      const status = this.computeStatus(doc.expiryDate);
      if (status !== doc.status) {
        doc.status = status;
        await this.documentsRepository.save(doc);
        if (status !== DocumentStatus.VALID) {
          await this.alertsService.createDedup({
            level:
              status === DocumentStatus.EXPIRED
                ? AlertLevel.YELLOW
                : AlertLevel.GREEN,
            sourceType: AlertSourceType.DOCUMENT,
            sourceId: doc.id,
            title:
              status === DocumentStatus.EXPIRED
                ? 'Documento vencido'
                : 'Documento por vencer',
            message: `El documento (${doc.category}) ${status === DocumentStatus.EXPIRED ? 'está vencido' : `vence el ${doc.expiryDate}`}.`,
            targetRoles: ['admin', 'maintenance', 'dispatcher', 'manager'],
          });
        }
      }
    }
  }
}
