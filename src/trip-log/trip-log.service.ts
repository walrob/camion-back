import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TripLogEntry } from './entities/trip-log-entry.entity';
import { CreateTripLogEntryDto } from './dto/create-trip-log-entry.dto';
import { UpdateTripLogEntryDto } from './dto/update-trip-log-entry.dto';
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { TripStatus } from 'src/common/enums/tripStatus.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { TripsService } from 'src/trips/trips.service';
import { DriversService } from 'src/drivers/drivers.service';
import { AlertsService } from 'src/alerts/alerts.service';
import { CatalogsService } from 'src/catalogs/catalogs.service';
import { CurrenciesService } from 'src/currencies/currencies.service';
import { SettingsService } from 'src/settings/settings.service';
import { SETTING } from 'src/settings/settings.catalog';
import { BEHAVIOR, CATALOG } from 'src/catalogs/catalogs.catalog';

@Injectable()
export class TripLogService {
  constructor(
    @InjectRepository(TripLogEntry)
    private readonly entriesRepository: Repository<TripLogEntry>,
    private readonly tripsService: TripsService,
    private readonly driversService: DriversService,
    private readonly alertsService: AlertsService,
    private readonly catalogsService: CatalogsService,
    private readonly currenciesService: CurrenciesService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * El tipo tiene que existir en el catálogo de la empresa y estar activo.
   *
   * Reemplaza al `@IsEnum` del DTO: la lista ya no la fija el código. Un tipo
   * desactivado se sigue mostrando en el histórico, pero no admite cargas
   * nuevas.
   */
  private async assertTipoValido(type: string): Promise<void> {
    const items = await this.catalogsService.items(CATALOG.EXPENSE_TYPE);
    const item = items.find((i) => i.key === type);
    if (!item) {
      throw new BadRequestException(`Tipo de gasto desconocido: ${type}`);
    }
    if (!item.isActive) {
      throw new BadRequestException(
        `«${item.label}» está desactivado en la configuración de tu empresa.`,
      );
    }
  }

  /**
   * Claves de tipo de gasto que **restan** en la cuenta del viaje.
   *
   * Se resuelve contra el catálogo de la empresa. Un tipo que el cliente creó y
   * no marcó como adelanto suma, que es el default seguro.
   */
  private async clavesDeAdelanto(): Promise<Set<string>> {
    const items = await this.catalogsService.items(CATALOG.EXPENSE_TYPE);
    return new Set(
      items.filter((i) => i.behavior === BEHAVIOR.ADVANCE).map((i) => i.key),
    );
  }

  async create(
    dto: CreateTripLogEntryDto,
    user: ActiveUserInterface,
  ): Promise<TripLogEntry> {
    // Idempotencia: si ya existe una entrada con ese clientId, devolverla.
    if (dto.clientId) {
      const existing = await this.entriesRepository.findOne({
        where: { clientId: dto.clientId },
      });
      if (existing) return existing;
    }

    // Después de la idempotencia: una carga que ya entró no se rechaza porque
    // el catálogo cambió mientras el celular estaba sin señal.
    await this.assertTipoValido(dto.type);

    const trip = await this.tripsService.findOne(dto.tripId);
    await this.assertTripOwnedByDriver(trip.driverId, user);

    if (
      trip.status !== TripStatus.ASSIGNED &&
      trip.status !== TripStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'No se pueden cargar gastos en un viaje finalizado o cancelado.',
      );
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    // Conversión a moneda base, congelada acá (docs/CONFIGURACION.md §7.2). Si
    // no hay cotización de ese día, `amountBase` queda en null y el movimiento
    // se guarda igual: el chofer no puede quedar trabado en la aduana.
    const fx = await this.currenciesService.convertir(
      Number(dto.amount),
      dto.currency,
      occurredAt,
    );

    const entry = this.entriesRepository.create({
      ...dto,
      currency: fx.currency,
      exchangeRate: fx.exchangeRate,
      amountBase: fx.amountBase,
      occurredAt,
      createdBy: user.id,
    });
    const saved = await this.entriesRepository.save(entry);

    // Alerta amarilla si el gasto supera el umbral configurado. Se compara en
    // moneda base: el umbral está en la moneda de la empresa, no en la del
    // gasto. Sin conversión todavía, no hay con qué comparar.
    if (saved.amountBase != null) {
      await this.alertsService.createFromExpense({
        id: saved.id,
        amount: Number(saved.amountBase),
        type: saved.type,
      });
    }

    return saved;
  }

  listByTrip(tripId: string): Promise<TripLogEntry[]> {
    return this.entriesRepository.find({
      where: { tripId },
      order: { occurredAt: 'DESC' },
    });
  }

  async listMine(userId: string): Promise<TripLogEntry[]> {
    const driver = await this.driversService.findByUserId(userId);
    return this.entriesRepository
      .createQueryBuilder('e')
      .innerJoin('e.trip', 't')
      .where('t.driverId = :driverId', { driverId: driver.id })
      .orderBy('e.occurredAt', 'DESC')
      .getMany();
  }

  /** Totales por tipo, total general y total de adelantos del viaje. */
  async summary(tripId: string) {
    const entries = await this.entriesRepository.find({ where: { tripId } });

    // Qué resta y qué suma lo dice el catálogo de la empresa, no la clave: un
    // tipo propio marcado como adelanto —«Adelanto por transferencia»— tiene
    // que restar igual que el de fábrica (docs/CONFIGURACION.md §5).
    const adelantos = await this.clavesDeAdelanto();

    // Con viático de monto fijo, lo que el chofer haya cargado como viático en
    // la bitácora NO suma: ese importe lo pone la rendición desde el viaje. Sin
    // esta exclusión se pagaría dos veces (docs/CONFIGURACION.md §6.4).
    const modoViatico = await this.settings.getString(
      SETTING.SETTLEMENT_PER_DIEM_MODE,
    );
    const viaticoDeBitacoraNoSuma = modoViatico === 'fixed';

    const byType: Record<string, number> = {};
    /** Subtotales en la moneda en que se gastó (viaje internacional, §7.4). */
    const byCurrency: Record<string, number> = {};
    let total = 0;
    let totalAdvances = 0;
    /** Movimientos en otra moneda que todavía no tienen cotización (§7.3). */
    let pendingFx = 0;
    /** Viáticos de bitácora que no suman por el modo de viático fijo (§6.4). */
    let noComputado = 0;

    for (const e of entries) {
      byCurrency[e.currency] = (byCurrency[e.currency] ?? 0) + Number(e.amount);

      // Todo lo que se suma va en moneda base: mezclar guaraníes con pesos da
      // un número que parece correcto y no lo es. Lo que todavía no se pudo
      // convertir no entra en el total y se cuenta aparte, para que nadie cierre
      // una rendición a la que le falta la mitad.
      if (e.amountBase == null) {
        pendingFx++;
        continue;
      }
      const enBase = Number(e.amountBase);
      byType[e.type] = (byType[e.type] ?? 0) + enBase;

      if (viaticoDeBitacoraNoSuma && e.type === 'per_diem') {
        noComputado += enBase;
        continue;
      }
      if (adelantos.has(e.type)) totalAdvances += enBase;
      else total += enBase;
    }

    return {
      byType,
      byCurrency,
      totalExpenses: total,
      totalAdvances,
      netToSettle: total - totalAdvances,
      count: entries.length,
      pendingFx,
      noComputado,
      currency: await this.currenciesService.base(),
    };
  }


  async listByTripOwned(tripId: string, user: ActiveUserInterface) {
    const trip = await this.tripsService.findOne(tripId);
    await this.assertTripOwnedByDriver(trip.driverId, user);
    return this.listByTrip(tripId);
  }

  async summaryOwned(tripId: string, user: ActiveUserInterface) {
    const trip = await this.tripsService.findOne(tripId);
    await this.assertTripOwnedByDriver(trip.driverId, user);
    return this.summary(tripId);
  }

  async findOne(id: string): Promise<TripLogEntry> {
    const entry = await this.entriesRepository.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Entrada de bitácora no encontrada.');
    return entry;
  }

  async update(
    id: string,
    dto: UpdateTripLogEntryDto,
    user: ActiveUserInterface,
  ): Promise<TripLogEntry> {
    const entry = await this.findOne(id);
    await this.assertEditable(entry, user);
    Object.assign(entry, dto, { updatedBy: user.id });
    return this.entriesRepository.save(entry);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const entry = await this.findOne(id);
    await this.assertEditable(entry, user);
    entry.deletedBy = user.id;
    await this.entriesRepository.save(entry);
    return this.entriesRepository.softDelete(id);
  }

  private async assertEditable(
    entry: TripLogEntry,
    user: ActiveUserInterface,
  ) {
    const trip = await this.tripsService.findOne(entry.tripId);
    if (trip.status === TripStatus.FINISHED || trip.status === TripStatus.CANCELED) {
      throw new BadRequestException(
        'La bitácora del viaje está cerrada y no puede modificarse.',
      );
    }
    await this.assertTripOwnedByDriver(trip.driverId, user);
  }

  private async assertTripOwnedByDriver(
    tripDriverId: string,
    user: ActiveUserInterface,
  ) {
    const driver = await this.driversService.findByUserId(user.id);
    if (tripDriverId !== driver.id) {
      throw new ForbiddenException('Este viaje no está asignado a usted.');
    }
  }
}
