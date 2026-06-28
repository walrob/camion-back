import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Document } from './entities/document.entity';
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

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
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

  expiring(days = WARNING_DAYS): Promise<Document[]> {
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    return this.documentsRepository.find({
      where: {
        expiryDate: LessThanOrEqual(limit.toISOString().slice(0, 10)),
        status: Not(DocumentStatus.VALID),
      },
      order: { expiryDate: 'ASC' },
    });
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
