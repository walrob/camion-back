import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as sharp from 'sharp';
import { Attachment } from './entities/attachment.entity';
import { AttachmentKind } from 'src/common/enums/attachmentKind.enum';
import { StorageService } from 'src/common/storage/storage.service';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    private readonly storageService: StorageService,
  ) {}

  private resolveKind(mime: string): AttachmentKind {
    if (mime.startsWith('image/')) return AttachmentKind.IMAGE;
    if (mime.startsWith('audio/')) return AttachmentKind.AUDIO;
    if (mime.startsWith('video/')) return AttachmentKind.VIDEO;
    if (mime === 'application/pdf') return AttachmentKind.PDF;
    throw new BadRequestException(`Tipo de archivo no soportado: ${mime}`);
  }

  /** Comprime imágenes (orientación + resize + jpeg) para reducir peso. */
  private async compressImage(file: Express.Multer.File) {
    const buffer = await sharp(file.buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    file.buffer = buffer;
    file.mimetype = 'image/jpeg';
    file.originalname = `${file.originalname.replace(/\.[^.]+$/, '')}.jpg`;
    file.size = buffer.length;
  }

  async upload(
    file: Express.Multer.File,
    entityType: string,
    entityId: string,
    uploadedBy?: string,
  ): Promise<Attachment> {
    if (!file?.buffer) {
      throw new BadRequestException('Archivo vacío o inválido.');
    }

    const kind = this.resolveKind(file.mimetype);

    if (kind === AttachmentKind.IMAGE) {
      await this.compressImage(file);
    }

    const s3Key = await this.storageService.uploadFile(
      file,
      `attachments/${entityType}`,
    );

    const attachment = this.attachmentsRepository.create({
      entityType,
      entityId,
      kind,
      s3Key,
      mime: file.mimetype,
      sizeBytes: file.size ?? file.buffer.length,
      uploadedBy,
      createdBy: uploadedBy,
    });

    return this.attachmentsRepository.save(attachment);
  }

  listByEntity(entityType: string, entityId: string): Promise<Attachment[]> {
    return this.attachmentsRepository.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Attachment> {
    const attachment = await this.attachmentsRepository.findOne({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado.');
    return attachment;
  }

  async getPresignedUrl(id: string): Promise<{ url: string }> {
    const attachment = await this.findOne(id);
    const url = await this.storageService.getPresignedUrl(attachment.s3Key, 300);
    return { url };
  }

  async remove(id: string, deletedBy?: string): Promise<{ id: string }> {
    const attachment = await this.findOne(id);
    if (deletedBy) {
      attachment.deletedBy = deletedBy;
      await this.attachmentsRepository.save(attachment);
    }
    await this.attachmentsRepository.softDelete(id);
    return { id };
  }
}
