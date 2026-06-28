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

const WARNING_DAYS = 30;

@Injectable()
export class CertificationsService {
  private readonly logger = new Logger(CertificationsService.name);

  constructor(
    @InjectRepository(Certification)
    private readonly certificationsRepository: Repository<Certification>,
    private readonly alertsService: AlertsService,
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
    user: ActiveUserInterface,
  ): Promise<Certification> {
    const cert = this.certificationsRepository.create({
      ...dto,
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
    user: ActiveUserInterface,
  ): Promise<Certification> {
    const cert = await this.findOne(id);
    Object.assign(cert, dto, { updatedBy: user.id });
    cert.status = this.computeStatus(cert.expiryDate);
    return this.certificationsRepository.save(cert);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const cert = await this.findOne(id);
    cert.deletedBy = user.id;
    await this.certificationsRepository.save(cert);
    return this.certificationsRepository.softDelete(id);
  }

  /**
   * Recalcula el estado de todos los permisos cada día. Cuando exista el módulo
   * de alertas (Fase 5), aquí se generan alertas para los que vencen pronto.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async recalculateStatuses(): Promise<void> {
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
