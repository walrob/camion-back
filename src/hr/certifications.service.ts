import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Certification } from './entities/certification.entity';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { CertificationStatus } from 'src/common/enums/certificationStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { AlertsService } from 'src/alerts/alerts.service';
import { StorageService } from 'src/common/storage/storage.service';
import { TenantCronRunner } from 'src/common/tenant/tenant-cron.runner';

const WARNING_DAYS = 30;

@Injectable()
export class CertificationsService {
  private readonly logger = new Logger(CertificationsService.name);

  constructor(
    @InjectRepository(Certification)
    private readonly certificationsRepository: Repository<Certification>,
    private readonly alertsService: AlertsService,
    private readonly storageService: StorageService,
    private readonly cronRunner: TenantCronRunner,
  ) {}

  /** Calcula el estado de un permiso a partir de su vencimiento. */
  computeStatus(expiryDate?: string | null): CertificationStatus {
    if (!expiryDate) return CertificationStatus.VALID;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    const warn = new Date(today);
    warn.setDate(warn.getDate() + WARNING_DAYS);

    if (expiry < today) return CertificationStatus.EXPIRED;
    if (expiry <= warn) return CertificationStatus.EXPIRING;
    return CertificationStatus.VALID;
  }

  async create(
    dto: CreateCertificationDto,
    file: Express.Multer.File | undefined,
    user: ActiveUserInterface,
  ): Promise<Certification> {
    // El fileKey lo define el archivo subido, nunca el cliente.
    const { fileKey: _ignored, ...rest } = dto;
    const fileKey = file
      ? await this.storageService.uploadFile(file, 'certifications')
      : undefined;
    const cert = this.certificationsRepository.create({
      ...rest,
      fileKey,
      status: this.computeStatus(dto.expiryDate),
      createdBy: user.id,
    });
    return this.certificationsRepository.save(cert);
  }

  listByEmployee(employeeId: string): Promise<Certification[]> {
    return this.certificationsRepository.find({
      where: { employeeId },
      order: { expiryDate: 'ASC' },
    });
  }

  /** Permisos por vencer o vencidos dentro de N días (default 30). */
  expiring(days = WARNING_DAYS): Promise<Certification[]> {
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    return this.certificationsRepository.find({
      where: {
        expiryDate: LessThanOrEqual(limit.toISOString().slice(0, 10)),
        status: Not(CertificationStatus.VALID),
      },
      relations: ['employee'],
      order: { expiryDate: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Certification> {
    const cert = await this.certificationsRepository.findOne({ where: { id } });
    if (!cert) throw new NotFoundException('Permiso/certificación no encontrado.');
    return cert;
  }

  async update(
    id: string,
    dto: UpdateCertificationDto,
    file: Express.Multer.File | undefined,
    user: ActiveUserInterface,
  ): Promise<Certification> {
    const cert = await this.findOne(id);
    const { fileKey: _ignored, ...rest } = dto;
    if (file) {
      cert.fileKey = await this.storageService.uploadFile(file, 'certifications');
    }
    Object.assign(cert, rest, { updatedBy: user.id });
    cert.status = this.computeStatus(cert.expiryDate);
    return this.certificationsRepository.save(cert);
  }

  /** URL firmada (temporal) para ver/descargar el archivo del permiso. */
  async getFileUrl(id: string): Promise<{ url: string }> {
    const cert = await this.findOne(id);
    if (!cert.fileKey) return { url: '' };
    const url = await this.storageService.getPresignedUrl(cert.fileKey, 300);
    return { url };
  }

  async remove(id: string, user: ActiveUserInterface) {
    const cert = await this.findOne(id);
    cert.deletedBy = user.id;
    await this.certificationsRepository.save(cert);
    return this.certificationsRepository.softDelete(id);
  }

  /**
   * Recalcula el estado de todos los permisos cada día y emite las alertas de
   * los que vencen pronto.
   *
   * Corre sin request: se hace una pasada por empresa para que las consultas
   * filtren y las alertas nazcan con dueño.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  recalculateStatuses(): Promise<void> {
    return this.cronRunner.porEmpresa('Estados de certificaciones', () =>
      this.recalculateStatusesOfCompany(),
    );
  }

  /** Una empresa, con su contexto ya abierto. */
  private async recalculateStatusesOfCompany(): Promise<void> {
    const all = await this.certificationsRepository.find();
    let changed = 0;
    for (const cert of all) {
      const status = this.computeStatus(cert.expiryDate);
      if (status !== cert.status) {
        cert.status = status;
        await this.certificationsRepository.save(cert);
        changed++;

        // Emitir alerta cuando pasa a por-vencer o vencido.
        if (status !== CertificationStatus.VALID) {
          await this.alertsService.createFromCertification({
            id: cert.id,
            type: cert.type,
            expiryDate: cert.expiryDate,
            expired: status === CertificationStatus.EXPIRED,
          });
        }
      }
    }
    if (changed) {
      this.logger.log(`Estados de certificaciones recalculados: ${changed}`);
    }
  }
}
