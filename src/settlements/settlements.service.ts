import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Settlement } from './entities/settlement.entity';
import { SettlementStatus } from 'src/common/enums/settlementStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { TripsService } from 'src/trips/trips.service';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripLogService } from 'src/trip-log/trip-log.service';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { StorageService } from 'src/common/storage/storage.service';
import { resolveSort } from 'src/common/utils/resolve-sort.util';
import {
  PdfReport,
  dateOnly,
  dateTime,
  money,
  number as num,
} from 'src/common/pdf/pdf-report.util';
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { TripStatus } from 'src/common/enums/tripStatus.enum';

// Columnas ordenables (clave del front → columna con alias del query builder).
const SETTLEMENT_SORTABLE: Record<string, string> = {
  'trip.code': 't.code',
  totalExpenses: 's.totalExpenses',
  totalAdvances: 's.totalAdvances',
  netToSettle: 's.netToSettle',
  status: 's.status',
  createdAt: 's.createdAt',
};

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

const TRIP_STATUS_LABELS: Record<string, string> = {
  [TripStatus.ASSIGNED]: 'Asignado',
  [TripStatus.IN_PROGRESS]: 'En curso',
  [TripStatus.FINISHED]: 'Finalizado',
  [TripStatus.CANCELED]: 'Cancelado',
};

const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type;

/** Totales que devuelve `TripLogService.summary`, para tipar el armado del PDF. */
type TripSummary = Awaited<ReturnType<TripLogService['summary']>>;

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private readonly settlementsRepository: Repository<Settlement>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
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
    const entries = await this.tripLogService.listByTrip(tripId);
    settlement.pdfKey = await this.uploadPdf(trip, summary, entries, settlement);

    return this.settlementsRepository.save(settlement);
  }

  /**
   * Viajes finalizados que todavía no tienen liquidación: los únicos que se
   * pueden rendir por primera vez. Un viaje que ya está en el listado de
   * liquidaciones no va acá — recalcularlo es una acción sobre esa fila (y solo
   * si sigue en borrador), no un "generar" nuevo.
   */
  async pendingTrips(): Promise<Trip[]> {
    return this.tripsRepository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.truck', 'truck')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.employee', 'emp')
      .where('t.status = :status', { status: TripStatus.FINISHED })
      // La liquidación borrada (soft delete) no cuenta: el viaje vuelve a estar
      // disponible para rendir. El subquery se arma con el builder para que
      // TypeORM escape los identificadores según el motor (MySQL usa backticks).
      .andWhere((qb) => {
        const sub = qb
          .subQuery()
          .select('1')
          .from(Settlement, 's')
          .where('s.tripId = t.id')
          .andWhere('s.deletedAt IS NULL')
          .getQuery();
        return `NOT EXISTS ${sub}`;
      })
      .orderBy('t.plannedStartAt', 'DESC')
      .getMany();
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
      relations: ['trip', 'trip.driver', 'trip.driver.employee'],
    });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada.');
    return settlement;
  }

  async paginate(
    options: IPaginationOptions,
    filters: {
      search?: string;
      status?: SettlementStatus;
      driverId?: string;
      from?: string;
      to?: string;
      sortBy?: string;
      order?: string;
    },
  ): Promise<Pagination<Settlement>> {
    const page = Number(options.page);
    const limit = Number(options.limit);

    const sort = resolveSort(filters.sortBy, filters.order, SETTLEMENT_SORTABLE, {
      orderBy: 's.createdAt',
      order: 'DESC',
    });

    const qb = this.settlementsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.trip', 't')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.employee', 'emp')
      .orderBy(sort.orderBy, sort.order);

    // Búsqueda libre: código del viaje o nombre/apellido del chofer (los datos
    // que muestra la tabla; el resto de las columnas son montos y estado, que ya
    // tienen su propio filtro).
    if (filters.search?.trim()) {
      qb.andWhere(
        `(LOWER(t.code) LIKE LOWER(:search)
          OR LOWER(emp.firstName) LIKE LOWER(:search)
          OR LOWER(emp.lastName) LIKE LOWER(:search))`,
        { search: `%${filters.search.trim()}%` },
      );
    }
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

  /**
   * URL firmada del PDF. Si la liquidación todavía no tiene uno —las creadas
   * antes de que `generate` lo armara, o las cargadas por el seed— se genera en
   * el momento y se guarda, en vez de rechazar el pedido: el PDF es un derivado
   * de datos que ya están en la liquidación, así que siempre se puede rehacer.
   * Vale también para las cerradas, donde recalcular está bloqueado.
   */
  async getPdfUrl(id: string): Promise<{ url: string }> {
    let settlement = await this.findOne(id);
    if (!settlement.pdfKey) {
      settlement = await this.buildAndStorePdf(settlement);
    }
    const url = await this.storageService.getPresignedUrl(settlement.pdfKey, 300);
    return { url };
  }

  /** Arma el PDF de una liquidación existente, lo sube y persiste su `pdfKey`. */
  private async buildAndStorePdf(settlement: Settlement): Promise<Settlement> {
    const trip = await this.tripsService.findOne(settlement.tripId);
    const summary = await this.tripLogService.summary(settlement.tripId);
    const entries = await this.tripLogService.listByTrip(settlement.tripId);
    settlement.pdfKey = await this.uploadPdf(trip, summary, entries, settlement);
    return this.settlementsRepository.save(settlement);
  }

  /** Genera el PDF de un viaje y lo sube a S3; devuelve la key. */
  private async uploadPdf(
    trip: Trip,
    summary: TripSummary,
    entries: TripLogEntry[],
    settlement?: Settlement,
  ): Promise<string> {
    const pdfBuffer = await this.buildPdf(trip, summary, entries, settlement);
    const file = {
      buffer: pdfBuffer,
      originalname: `liquidacion-${trip.code}.pdf`,
      mimetype: 'application/pdf',
    } as Express.Multer.File;
    return this.storageService.uploadFile(file, 'settlements');
  }

  /**
   * Comprobante de liquidación. Incluye el detalle movimiento por movimiento
   * —no solo los totales— porque es lo que el chofer y administración firman:
   * cada importe del resumen tiene que poder rastrearse hasta su gasto.
   */
  private async buildPdf(
    trip: Trip,
    summary: TripSummary,
    entries: TripLogEntry[] = [],
    settlement?: Settlement,
  ): Promise<Buffer> {
    const emp = trip.driver?.employee;
    const driverName = emp ? `${emp.firstName} ${emp.lastName}` : '-';
    const currency = settlement?.currency || 'ARS';
    const closed = settlement?.status === SettlementStatus.CLOSED;

    // Movimientos ordenados cronológicamente y separados: los adelantos son
    // dinero entregado al chofer, no gasto rendido, y restan del neto.
    const sorted = [...entries].sort(
      (a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt),
    );
    const expenses = sorted.filter((e) => e.type !== TripLogType.CASH_ADVANCE);
    const advances = sorted.filter((e) => e.type === TripLogType.CASH_ADVANCE);

    const report = new PdfReport({
      title: 'Liquidación de viaje',
      docId: trip.code,
      subtitle: `${trip.origin} → ${trip.destination}`,
      badge: {
        text: closed ? 'Cerrada' : 'Borrador',
        tone: closed ? 'ok' : 'warn',
      },
      dataDateLabel: 'Fecha de liquidación',
      dataDate: settlement?.updatedAt ?? settlement?.createdAt ?? null,
      footerNote: closed
        ? undefined
        : 'Liquidación en borrador: los importes pueden variar hasta su cierre.',
    });

    // ── Viaje ──────────────────────────────────────────────────────────────
    const truck = trip.truck;
    const trailer = trip.trailer;
    report.section('Datos del viaje', 0).fields([
      { label: 'Código', value: trip.code },
      { label: 'Estado', value: TRIP_STATUS_LABELS[trip.status] ?? trip.status },
      { label: 'Origen', value: trip.origin },
      { label: 'Destino', value: trip.destination },
      { label: 'Salida planificada', value: dateTime(trip.plannedStartAt) },
      { label: 'Llegada planificada', value: dateTime(trip.plannedEndAt) },
      { label: 'Salida real', value: dateTime(trip.startedAt) },
      { label: 'Llegada real', value: dateTime(trip.finishedAt) },
      {
        label: 'Distancia',
        value: trip.distanceKm != null ? `${num(trip.distanceKm)} km` : '-',
      },
      {
        label: 'Odómetro inicial',
        value: trip.startOdometerKm != null ? `${num(trip.startOdometerKm)} km` : '-',
      },
      {
        label: 'Odómetro final',
        value: trip.endOdometerKm != null ? `${num(trip.endOdometerKm)} km` : '-',
      },
      { label: 'Carga', value: trip.cargoDescription },
    ]);

    // ── Chofer y unidad ────────────────────────────────────────────────────
    report.section('Chofer y unidad').fields([
      { label: 'Chofer', value: driverName },
      { label: 'Documento', value: emp?.documentId },
      { label: 'Teléfono', value: emp?.phone },
      { label: 'Licencia N°', value: trip.driver?.licenseNumber },
      { label: 'Categoría', value: trip.driver?.licenseType },
      { label: 'Vencimiento licencia', value: dateOnly(trip.driver?.licenseExpiry) },
      {
        label: 'Camión',
        value: truck
          ? [truck.plate, truck.internalNumber && `(int. ${truck.internalNumber})`]
              .filter(Boolean)
              .join(' ')
          : '-',
      },
      {
        label: 'Marca / Modelo',
        value: truck ? [truck.brand, truck.model, truck.year].filter(Boolean).join(' ') : '-',
      },
      {
        label: 'Acoplado',
        value: trailer ? `${trailer.plate}${trailer.type ? ` - ${trailer.type}` : ''}` : '-',
      },
    ]);

    // ── Detalle de gastos ──────────────────────────────────────────────────
    report
      .section('Detalle de gastos rendidos')
      .table({
        columns: [
          { label: 'Fecha', width: 13 },
          { label: 'Concepto', width: 14 },
          { label: 'Detalle', width: 32 },
          { label: 'Litros', width: 9, align: 'right' },
          { label: 'Odómetro', width: 12, align: 'right' },
          { label: 'Importe', width: 20, align: 'right' },
        ],
        rows: expenses.map((e) => [
          dateTime(e.occurredAt),
          typeLabel(e.type),
          e.notes,
          e.liters != null ? num(e.liters, 2) : '',
          e.odometerKm != null ? `${num(e.odometerKm)} km` : '',
          money(e.amount, e.currency || currency),
        ]),
        totalRow: [
          'Total',
          `${expenses.length} mov.`,
          '',
          '',
          '',
          money(summary.totalExpenses, currency),
        ],
        emptyText: 'El viaje no registra gastos rendidos.',
      });

    // ── Adelantos ──────────────────────────────────────────────────────────
    report.section('Adelantos entregados').table({
      columns: [
        { label: 'Fecha', width: 16 },
        { label: 'Detalle', width: 54 },
        { label: 'Odómetro', width: 13, align: 'right' },
        { label: 'Importe', width: 17, align: 'right' },
      ],
      rows: advances.map((e) => [
        dateTime(e.occurredAt),
        e.notes,
        e.odometerKm != null ? `${num(e.odometerKm)} km` : '',
        money(e.amount, e.currency || currency),
      ]),
      totalRow: [
        'Total',
        `${advances.length} mov.`,
        '',
        money(summary.totalAdvances, currency),
      ],
      emptyText: 'El viaje no registra adelantos.',
    });

    // ── Resumen por concepto ───────────────────────────────────────────────
    const counts = sorted.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {});
    const byType = Object.entries(summary.byType || {}).sort(
      (a, b) => Number(b[1]) - Number(a[1]),
    );
    const base = Number(summary.totalExpenses) || 0;

    report.section('Resumen por concepto').table({
      columns: [
        { label: 'Concepto', width: 40 },
        { label: 'Movimientos', width: 18, align: 'right' },
        { label: 'Importe', width: 24, align: 'right' },
        { label: '% s/gastos', width: 18, align: 'right' },
      ],
      rows: byType.map(([type, amount]) => [
        typeLabel(type),
        num(counts[type] ?? 0),
        money(amount, currency),
        type === TripLogType.CASH_ADVANCE || !base
          ? '-'
          : `${num((Number(amount) / base) * 100, 1)} %`,
      ]),
      emptyText: 'Sin movimientos cargados en la bitácora del viaje.',
    });

    // ── Totales ────────────────────────────────────────────────────────────
    report.totals([
      { label: 'Total gastos rendidos', value: money(summary.totalExpenses, currency) },
      { label: 'Total adelantos entregados', value: money(summary.totalAdvances, currency) },
      { label: 'NETO A RENDIR', value: money(summary.netToSettle, currency), strong: true },
    ]);

    if (trip.notes) {
      report.section('Observaciones del viaje').paragraph(trip.notes, { muted: true });
    }

    report.signatures([
      `Conforme del chofer - ${driverName}`,
      'Administración / Liquidaciones',
    ]);

    return report.finish();
  }
}
