import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import PDFDocument = require('pdfkit');
import { Settlement } from './entities/settlement.entity';
import { SettlementStatus } from 'src/common/enums/settlementStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { TripsService } from 'src/trips/trips.service';
import { TripLogService } from 'src/trip-log/trip-log.service';
import { StorageService } from 'src/common/storage/storage.service';

const TYPE_LABELS: Record<string, string> = {
  fuel: 'Combustible',
  toll: 'Peajes',
  expense: 'Gastos',
  cash_advance: 'Adelantos',
  repair: 'Reparaciones',
  fine: 'Multas',
  per_diem: 'Viáticos',
  other: 'Otros',
};

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private readonly settlementsRepository: Repository<Settlement>,
    private readonly tripsService: TripsService,
    private readonly tripLogService: TripLogService,
    private readonly storageService: StorageService,
  ) {}

  /** Genera o recalcula la liquidación (en borrador) de un viaje. */
  async generate(
    tripId: string,
    user: ActiveUserInterface,
  ): Promise<Settlement> {
    const trip = await this.tripsService.findOne(tripId);
    const summary = await this.tripLogService.summary(tripId);

    let settlement = await this.settlementsRepository.findOne({
      where: { tripId },
    });

    if (settlement && settlement.status === SettlementStatus.CLOSED) {
      throw new BadRequestException(
        'La liquidación ya está cerrada y no puede recalcularse.',
      );
    }

    if (!settlement) {
      settlement = this.settlementsRepository.create({
        tripId,
        createdBy: user.id,
      });
    } else {
      settlement.updatedBy = user.id;
    }

    settlement.totalsByType = summary.byType;
    settlement.totalExpenses = summary.totalExpenses;
    settlement.totalAdvances = summary.totalAdvances;
    settlement.netToSettle = summary.netToSettle;

    // Generar PDF y subirlo a S3.
    const pdfBuffer = await this.buildPdf(trip, summary);
    const file = {
      buffer: pdfBuffer,
      originalname: `liquidacion-${trip.code}.pdf`,
      mimetype: 'application/pdf',
    } as Express.Multer.File;
    settlement.pdfKey = await this.storageService.uploadFile(file, 'settlements');

    return this.settlementsRepository.save(settlement);
  }

  async close(id: string, user: ActiveUserInterface): Promise<Settlement> {
    const settlement = await this.findOne(id);
    settlement.status = SettlementStatus.CLOSED;
    settlement.updatedBy = user.id;
    return this.settlementsRepository.save(settlement);
  }

  async findOne(id: string): Promise<Settlement> {
    const settlement = await this.settlementsRepository.findOne({
      where: { id },
      relations: ['trip', 'trip.driver', 'trip.driver.user'],
    });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada.');
    return settlement;
  }

  async paginate(
    options: IPaginationOptions,
    filters: { status?: SettlementStatus; driverId?: string; from?: string; to?: string },
  ): Promise<Pagination<Settlement>> {
    const page = Number(options.page);
    const limit = Number(options.limit);

    const qb = this.settlementsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.trip', 't')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'u')
      .orderBy('s.createdAt', 'DESC');

    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.driverId) qb.andWhere('t.driverId = :driverId', { driverId: filters.driverId });
    if (filters.from) qb.andWhere('s.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('s.createdAt <= :to', { to: filters.to });

    const total = await qb.getCount();
    const items = await qb.take(limit).skip((page - 1) * limit).getMany();

    return {
      items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    } as Pagination<Settlement>;
  }

  async getPdfUrl(id: string): Promise<{ url: string }> {
    const settlement = await this.findOne(id);
    if (!settlement.pdfKey) {
      throw new BadRequestException('La liquidación no tiene PDF generado.');
    }
    const url = await this.storageService.getPresignedUrl(settlement.pdfKey, 300);
    return { url };
  }

  private async buildPdf(trip: any, summary: any): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const driverName = trip.driver?.user?.name ?? '-';

    doc.fontSize(18).text('Liquidación de viaje', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Viaje: ${trip.code}`);
    doc.text(`Chofer: ${driverName}`);
    doc.text(`Recorrido: ${trip.origin} → ${trip.destination}`);
    if (trip.distanceKm != null) doc.text(`Distancia: ${trip.distanceKm} km`);
    doc.moveDown();

    doc.fontSize(13).text('Detalle por tipo', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    Object.entries(summary.byType || {}).forEach(([type, amount]) => {
      const label = TYPE_LABELS[type] ?? type;
      doc.text(`${label}: $ ${Number(amount).toFixed(2)}`);
    });

    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Total gastos rendidos: $ ${summary.totalExpenses.toFixed(2)}`);
    doc.text(`Total adelantos: $ ${summary.totalAdvances.toFixed(2)}`);
    doc
      .fontSize(14)
      .text(`Neto a rendir: $ ${summary.netToSettle.toFixed(2)}`, {
        underline: true,
      });

    doc.end();
    return done;
  }
}
