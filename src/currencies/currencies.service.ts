import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { CompanyCurrency } from './entities/company-currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { FuelRecord } from 'src/fuel/entities/fuel-record.entity';
import { SaveCurrenciesDto } from './dto/save-currencies.dto';
import { SaveRateDto } from './dto/save-rate.dto';
import { SettingsService } from 'src/settings/settings.service';
import { SETTING } from 'src/settings/settings.catalog';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

/** Resultado de convertir un importe a la moneda base de la empresa. */
export interface Conversion {
  currency: string;
  /** Cotización aplicada. `null` cuando no había ninguna para esa fecha. */
  exchangeRate: number | null;
  /**
   * Importe en moneda base. `null` = **pendiente de conversión**: se guarda el
   * movimiento igual y la oficina carga la cotización después (§7.3).
   */
  amountBase: number | null;
}

/** Monedas de la región, para ofrecerlas sin que nadie tipee un ISO 4217. */
export const MONEDAS_CONOCIDAS: {
  code: string;
  symbol: string;
  decimals: number;
  label: string;
}[] = [
  { code: 'ARS', symbol: '$', decimals: 2, label: 'Peso argentino' },
  { code: 'USD', symbol: 'US$', decimals: 2, label: 'Dólar estadounidense' },
  { code: 'BRL', symbol: 'R$', decimals: 2, label: 'Real brasileño' },
  { code: 'PYG', symbol: '₲', decimals: 0, label: 'Guaraní paraguayo' },
  { code: 'CLP', symbol: '$', decimals: 0, label: 'Peso chileno' },
  { code: 'UYU', symbol: '$U', decimals: 2, label: 'Peso uruguayo' },
  { code: 'BOB', symbol: 'Bs', decimals: 2, label: 'Boliviano' },
  { code: 'EUR', symbol: '€', decimals: 2, label: 'Euro' },
];

const CONOCIDA_POR_CODIGO = new Map(MONEDAS_CONOCIDAS.map((m) => [m.code, m]));

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(CompanyCurrency)
    private readonly currenciesRepository: Repository<CompanyCurrency>,
    @InjectRepository(ExchangeRate)
    private readonly ratesRepository: Repository<ExchangeRate>,
    // Sólo como entidades: completar lo pendiente no justifica depender de los
    // servicios de bitácora y combustible, que a su vez dependen de éste.
    @InjectRepository(TripLogEntry)
    private readonly tripLogRepository: Repository<TripLogEntry>,
    @InjectRepository(FuelRecord)
    private readonly fuelRepository: Repository<FuelRecord>,
    private readonly settings: SettingsService,
  ) {}

  // ───────── Lectura ─────────

  /** Moneda en la que la empresa mira sus números. */
  base(): Promise<string> {
    return this.settings.getString(SETTING.BASE_CURRENCY);
  }

  /**
   * Monedas con las que se puede operar: la base siempre, más las que la
   * empresa haya habilitado.
   */
  async activas() {
    const base = await this.base();
    const propias = await this.currenciesRepository.find({
      where: { isActive: true },
      order: { code: 'ASC' },
    });

    const salida = propias.map((c) => ({
      code: c.code,
      symbol: c.symbol,
      decimals: c.decimals,
      isBase: c.code === base,
    }));

    if (!salida.some((c) => c.isBase)) {
      const conocida = CONOCIDA_POR_CODIGO.get(base);
      salida.unshift({
        code: base,
        symbol: conocida?.symbol ?? base,
        decimals: conocida?.decimals ?? 2,
        isBase: true,
      });
    }

    return salida;
  }

  /** ¿La empresa opera con más de una moneda? */
  async esMultimoneda(): Promise<boolean> {
    return (await this.activas()).length > 1;
  }

  /** Cotización vigente de una moneda a una fecha: la última con fecha ≤ esa. */
  async cotizacionA(code: string, fecha: string): Promise<number | null> {
    const fila = await this.ratesRepository.findOne({
      where: { code, date: LessThanOrEqual(fecha) },
      order: { date: 'DESC' },
    });
    return fila ? Number(fila.rate) : null;
  }

  /**
   * Convierte un importe a moneda base y **congela** el resultado.
   *
   * El llamador guarda `exchangeRate` y `amountBase` en el movimiento: nunca se
   * recalculan. La rendición de marzo no puede cambiar de valor en junio porque
   * se movió el dólar (§7.2).
   *
   * Si no hay cotización, **no falla**: devuelve `amountBase: null` y el
   * movimiento queda pendiente de conversión. El chofer está en la aduana, no
   * en la oficina (§7.3).
   */
  async convertir(
    amount: number,
    currency: string | undefined,
    fecha: Date | string,
  ): Promise<Conversion> {
    const base = await this.base();
    const code = (currency || base).toUpperCase();
    const dia =
      typeof fecha === 'string' ? fecha.slice(0, 10) : fecha.toISOString().slice(0, 10);

    if (code === base) {
      return { currency: code, exchangeRate: 1, amountBase: amount };
    }

    const rate = await this.cotizacionA(code, dia);
    return {
      currency: code,
      exchangeRate: rate,
      amountBase: rate == null ? null : Number((amount * rate).toFixed(2)),
    };
  }

  rates(code?: string): Promise<ExchangeRate[]> {
    return this.ratesRepository.find({
      where: code ? { code } : {},
      order: { date: 'DESC', code: 'ASC' },
      take: 200,
    });
  }

  // ───────── Escritura ─────────

  /** Reemplaza el juego de monedas habilitadas. */
  async saveCurrencies(dto: SaveCurrenciesDto, user: ActiveUserInterface) {
    const base = await this.base();
    const guardadas = await this.currenciesRepository.find();

    for (const item of dto.currencies) {
      const code = item.code.toUpperCase();
      const conocida = CONOCIDA_POR_CODIGO.get(code);

      let fila = guardadas.find((g) => g.code === code);
      if (!fila) fila = this.currenciesRepository.create({ code });
      fila.symbol = item.symbol || conocida?.symbol || code;
      fila.decimals = item.decimals ?? conocida?.decimals ?? 2;
      fila.isActive = item.isActive ?? true;
      fila.updatedBy = user.id;
      await this.currenciesRepository.save(fila);
    }

    // Desactivar la base sería dejar a la empresa sin moneda en la que mirar
    // sus números: se ignora en vez de romper.
    for (const fila of guardadas) {
      if (dto.currencies.some((c) => c.code.toUpperCase() === fila.code)) continue;
      if (fila.code === base || !fila.isActive) continue;
      fila.isActive = false;
      fila.updatedBy = user.id;
      await this.currenciesRepository.save(fila);
    }

    return this.activas();
  }

  /**
   * Carga (o corrige) la cotización de un día.
   *
   * No recalcula lo ya convertido: lo viejo quedó congelado con la cotización
   * que tenía. Lo que sí destraba es lo que quedó **pendiente**, que se resuelve
   * con `TripLogService.convertirPendientes`.
   */
  async saveRate(dto: SaveRateDto, user: ActiveUserInterface): Promise<ExchangeRate> {
    const base = await this.base();
    const code = dto.code.toUpperCase();

    if (code === base) {
      throw new BadRequestException(
        `${base} es tu moneda base: no necesita cotización.`,
      );
    }
    if (dto.rate <= 0) {
      throw new BadRequestException('La cotización tiene que ser mayor que cero.');
    }

    let fila = await this.ratesRepository.findOne({
      where: { code, date: dto.date },
    });
    if (!fila) {
      fila = this.ratesRepository.create({ code, date: dto.date, createdBy: user.id });
    }
    fila.rate = dto.rate;
    fila.source = dto.source ?? 'manual';
    const guardada = await this.ratesRepository.save(fila);

    // Con la cotización cargada, lo que había quedado pendiente ya se puede
    // convertir: es el paso que cierra el circuito del §7.3.
    await this.convertirPendientes();

    return guardada;
  }

  /**
   * Completa la conversión de los movimientos que quedaron pendientes.
   *
   * Recorre bitácora y combustible por repositorio y no por sus servicios: los
   * dos dependen de este módulo, y al revés se armaría un ciclo. Es el mismo
   * criterio con el que viajes consulta `Settlement`.
   *
   * **Lo ya convertido no se toca**: su cotización quedó congelada (§7.2). Sólo
   * se completa lo que estaba en `null`.
   */
  async convertirPendientes(): Promise<{ bitacora: number; combustible: number }> {
    const entries = await this.tripLogRepository.find({
      where: { amountBase: IsNull() },
    });
    let bitacora = 0;
    for (const e of entries) {
      const fx = await this.convertir(Number(e.amount), e.currency, e.occurredAt);
      if (fx.amountBase == null) continue;
      e.exchangeRate = fx.exchangeRate;
      e.amountBase = fx.amountBase;
      await this.tripLogRepository.save(e);
      bitacora++;
    }

    const cargas = await this.fuelRepository.find({ where: { amountBase: IsNull() } });
    let combustible = 0;
    for (const c of cargas) {
      const fx = await this.convertir(
        Number(c.totalAmount),
        c.currency,
        c.occurredAt,
      );
      if (fx.amountBase == null) continue;
      c.exchangeRate = fx.exchangeRate;
      c.amountBase = fx.amountBase;
      await this.fuelRepository.save(c);
      combustible++;
    }

    return { bitacora, combustible };
  }

  /** Cuántos movimientos están esperando cotización, para avisar en pantalla. */
  async pendientes(): Promise<number> {
    const [bitacora, combustible] = await Promise.all([
      this.tripLogRepository.count({ where: { amountBase: IsNull() } }),
      this.fuelRepository.count({ where: { amountBase: IsNull() } }),
    ]);
    return bitacora + combustible;
  }
}
