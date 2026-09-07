import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import * as XLSX from 'xlsx';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { Incident } from 'src/incidents/entities/incident.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { TripLogType } from 'src/common/enums/tripLogType.enum';
import { IncidentType } from 'src/common/enums/incident.enum';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';
import { IndicatorFilterDto } from './dto/indicator-filter.dto';
import { ExpenseGroup } from './dto/expense-group-filter.dto';
import { SeriesBucket, SeriesFilterDto } from './dto/series-filter.dto';
import { getRetentionCutoff } from 'src/common/tenant/tenant-context';
import {
  DateWindowOptions,
  resolveDateWindow,
} from 'src/common/utils/date-window.util';

// Top N de gastos que devuelve el summary (vista de página). El detalle completo
// se obtiene bajo demanda desde el endpoint `expenses`.
const TOP_EXPENSES = 10;

/**
 * Ventana de **todos** los indicadores (summary, series, cortes y detalle).
 *
 * Es una sola a propósito: la página manda el mismo rango a los cinco endpoints
 * y, si uno lo rechazara por ancho, se cargaría media pantalla y la otra mitad
 * daría error.
 *
 * El tope pasó de 6 a 24 meses cuando se agregaron las series: una tendencia
 * necesita historia —con 6 meses la serie mensual no llega a mostrar un ciclo—
 * y 24 es exactamente lo que retiene el plan que incluye Indicadores, así que
 * deja de rechazar un rango que la empresa igual tiene derecho a ver. El límite
 * real lo sigue poniendo la retención, que se aplica en el repositorio.
 */
const INDICATORS_WINDOW: DateWindowOptions = { defaultDays: 30, maxMonths: 24 };

const DIA_MS = 86_400_000;

/**
 * Marca interna para la clave nula al cruzar agregados (un viaje sin
 * clasificar, un gasto sin camión). `null` no sirve como clave de Map cuando
 * hay que distinguirlo de "no vino en esta consulta", y el rótulo definitivo lo
 * pone cada endpoint al final.
 */
const NULO = '\u0000';

@Injectable()
export class IndicatorsService {
  constructor(
    @InjectRepository(TripLogEntry)
    private readonly entriesRepository: Repository<TripLogEntry>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    @InjectRepository(Incident)
    private readonly incidentsRepository: Repository<Incident>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
  ) {}

  // ───────── Filtros ─────────
  private expenseQuery(f: IndicatorFilterDto): SelectQueryBuilder<TripLogEntry> {
    const qb = this.entriesRepository
      .createQueryBuilder('e')
      .leftJoin('e.trip', 't')
      .leftJoin('t.truck', 'truck')
      .leftJoin('t.driver', 'd')
      .leftJoin('d.employee', 'emp');
    if (f.truckId) qb.andWhere('t.truckId = :truckId', { truckId: f.truckId });
    if (f.driverId) qb.andWhere('t.driverId = :driverId', { driverId: f.driverId });
    if (f.fleetId) qb.andWhere('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    if (f.from) qb.andWhere('e.occurredAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('e.occurredAt <= :to', { to: f.to });
    return qb;
  }

  private tripQuery(f: IndicatorFilterDto): SelectQueryBuilder<Trip> {
    const qb = this.tripsRepository
      .createQueryBuilder('t')
      .leftJoin('t.truck', 'truck')
      .where('t.distanceKm IS NOT NULL');
    if (f.truckId) qb.andWhere('t.truckId = :truckId', { truckId: f.truckId });
    if (f.driverId) qb.andWhere('t.driverId = :driverId', { driverId: f.driverId });
    if (f.fleetId) qb.andWhere('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    if (f.from) qb.andWhere('t.finishedAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('t.finishedAt <= :to', { to: f.to });
    return qb;
  }

  // ───────── KPIs ─────────
  private async sumExpenses(f: IndicatorFilterDto, types?: TripLogType[]): Promise<number> {
    const qb = this.expenseQuery(f).select('COALESCE(SUM(e.amountBase),0)', 's');
    if (types) qb.andWhere('e.type IN (:...types)', { types });
    else qb.andWhere('e.type != :adv', { adv: TripLogType.CASH_ADVANCE });
    const { s } = await qb.getRawOne();
    return Number(s);
  }

  private async sumDistance(f: IndicatorFilterDto): Promise<number> {
    const { s } = await this.tripQuery(f)
      .select('COALESCE(SUM(t.distanceKm),0)', 's')
      .getRawOne();
    return Number(s);
  }

  private async sumLiters(f: IndicatorFilterDto): Promise<number> {
    const { s } = await this.expenseQuery(f)
      .select('COALESCE(SUM(e.liters),0)', 's')
      .andWhere('e.type = :fuel', { fuel: TripLogType.FUEL })
      .getRawOne();
    return Number(s);
  }

  private async expenseByGroup(
    f: IndicatorFilterDto,
    keyExpr: string,
    limit?: number,
  ): Promise<{ key: string; total: number }[]> {
    const qb = this.expenseQuery(f)
      .select(keyExpr, 'k')
      .addSelect('COALESCE(SUM(e.amountBase),0)', 'total')
      .andWhere('e.type != :adv', { adv: TripLogType.CASH_ADVANCE })
      .groupBy(keyExpr)
      .orderBy('total', 'DESC');
    if (limit) qb.limit(limit);
    const rows = await qb.getRawMany();
    return rows.map((r) => ({ key: r.k ?? '-', total: Number(r.total) }));
  }

  // Expresión de la dimensión a agrupar (patente del camión / nombre del chofer).
  private groupKeyExpr(group: ExpenseGroup): string {
    return group === 'driver'
      ? "CONCAT(emp.firstName, ' ', emp.lastName)"
      : 'truck.plate';
  }

  // Detalle completo (sin límite) de gastos por dimensión, para el modal "Ver todos".
  async expensesByGroup(
    f: IndicatorFilterDto,
    group: ExpenseGroup,
  ): Promise<{ key: string; total: number }[]> {
    const window = resolveDateWindow(f.from, f.to, INDICATORS_WINDOW);
    return this.expenseByGroup({ ...f, ...window }, this.groupKeyExpr(group));
  }

  private async breakdownsByTruck(f: IndicatorFilterDto) {
    const qb = this.incidentsRepository
      .createQueryBuilder('i')
      .leftJoin('i.truck', 'truck')
      .select('truck.plate', 'k')
      .addSelect('COUNT(*)', 'c')
      .where('i.type = :type', { type: IncidentType.MECHANICAL });
    if (f.truckId) qb.andWhere('i.truckId = :truckId', { truckId: f.truckId });
    if (f.fleetId) qb.andWhere('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    if (f.from) qb.andWhere('i.createdAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('i.createdAt <= :to', { to: f.to });
    const rows = await qb.groupBy('truck.plate').orderBy('c', 'DESC').getRawMany();
    return rows.map((r) => ({ key: r.k ?? '-', count: Number(r.c) }));
  }

  private async incidentResolutionAvgHours(f: IndicatorFilterDto): Promise<number> {
    const qb = this.incidentsRepository
      .createQueryBuilder('i')
      .select('AVG(TIMESTAMPDIFF(HOUR, i.createdAt, i.resolvedAt))', 'avg')
      .where('i.resolvedAt IS NOT NULL');
    if (f.truckId) qb.andWhere('i.truckId = :truckId', { truckId: f.truckId });
    if (f.driverId) qb.andWhere('i.driverId = :driverId', { driverId: f.driverId });
    if (f.from) qb.andWhere('i.createdAt >= :from', { from: f.from });
    if (f.to) qb.andWhere('i.createdAt <= :to', { to: f.to });
    const { avg } = await qb.getRawOne();
    return avg ? Number(Number(avg).toFixed(1)) : 0;
  }

  private async fleetAvailability(f: IndicatorFilterDto): Promise<number> {
    const qb = this.trucksRepository.createQueryBuilder('truck');
    if (f.fleetId) qb.where('truck.fleetId = :fleetId', { fleetId: f.fleetId });
    const total = await qb.getCount();
    if (!total) return 0;
    const available = await qb
      .clone()
      .andWhere('truck.status = :st', { st: TruckStatus.AVAILABLE })
      .getCount();
    return Number(((available / total) * 100).toFixed(1));
  }

  async summary(f: IndicatorFilterDto) {
    // Acota siempre la ventana (default/tope configurables por endpoint).
    f = { ...f, ...resolveDateWindow(f.from, f.to, INDICATORS_WINDOW) };
    const [expenses, distance, liters, byTruck, byDriver, extraordinary, breakdowns, resolution, availability, previous] =
      await Promise.all([
        this.sumExpenses(f),
        this.sumDistance(f),
        this.sumLiters(f),
        this.expenseByGroup(f, this.groupKeyExpr('truck'), TOP_EXPENSES),
        this.expenseByGroup(f, this.groupKeyExpr('driver'), TOP_EXPENSES),
        this.sumExpenses(f, [TripLogType.REPAIR, TripLogType.FINE]),
        this.breakdownsByTruck(f),
        this.incidentResolutionAvgHours(f),
        this.fleetAvailability(f),
        this.totalesAnteriores(f),
      ]);

    return {
      costPerKm: distance ? Number((expenses / distance).toFixed(2)) : 0,
      fuelEfficiency: distance ? Number(((liters / distance) * 100).toFixed(2)) : 0,
      totalExpenses: expenses,
      totalDistanceKm: distance,
      extraordinaryCosts: extraordinary,
      incidentResolutionAvgHours: resolution,
      fleetAvailabilityPct: availability,
      expenseByTruck: byTruck,
      expenseByDriver: byDriver,
      breakdownsByTruck: breakdowns,
      // Los mismos KPIs en la ventana inmediatamente anterior, de igual
      // duración. Un costo por km sin con qué compararse no es un indicador:
      // es un número. `null` cuando el período anterior queda fuera de lo que
      // el plan retiene —comparar contra datos recortados daría una variación
      // inventada—.
      previous,
      // Riesgo R4.1: la retención del plan recorta el histórico en silencio. Un
      // total que en realidad cubre 12 meses y se presenta como "el total" es un
      // número equivocado, no un número acotado. El reporte declara siempre qué
      // ventana cubrió para que el front lo muestre en el encabezado.
      coverage: this.coberturaEfectiva(f),
    };
  }

  /**
   * Ventana que realmente abarcan los números, y si la recortó el plan.
   *
   * Se calcula sobre el corte de retención vigente en el contexto del request,
   * que es el mismo que aplica el repositorio: si acá dijera otra cosa que allá,
   * el encabezado mentiría.
   */
  private coberturaEfectiva(f: IndicatorFilterDto): {
    from: string | null;
    to: string | null;
    retentionCutoff: string | null;
    truncatedByPlan: boolean;
  } {
    const corte = getRetentionCutoff();
    const desdePedido = f.from ? new Date(f.from) : null;

    const truncado = !!corte && (!desdePedido || desdePedido < corte);
    const soloFecha = (d: Date | null) =>
      d ? d.toISOString().slice(0, 10) : null;

    return {
      // El `from` efectivo es el más reciente entre lo pedido y el corte.
      from:
        truncado && corte
          ? soloFecha(corte)
          : (f.from ?? null),
      to: f.to ?? null,
      retentionCutoff: soloFecha(corte ?? null),
      truncatedByPlan: truncado,
    };
  }

  // ───────── Comparación contra el período anterior ─────────

  /**
   * Los KPIs de la ventana inmediatamente anterior, de igual duración.
   *
   * Se omiten los que no son de período: `fleetAvailabilityPct` es la foto de
   * hoy, no un acumulado, y compararla contra "la de antes" no significa nada
   * mientras no exista historial de estados de la flota.
   */
  private async totalesAnteriores(f: IndicatorFilterDto) {
    if (!f.from || !f.to) return null;

    const ventana = this.ventanaAnterior(f.from, f.to);

    // Si el período anterior cae antes del corte de retención, el repositorio no
    // devolvería sus filas: el "anterior" saldría en cero y la variación sería
    // inventada (−100 % contra un período que sí existió). Se prefiere no
    // mostrar comparación a mostrar una falsa.
    const corte = getRetentionCutoff();
    if (corte && this.parseSql(ventana.from) < corte) return null;

    const prev = { ...f, ...ventana };
    const [expenses, distance, liters, extraordinary, resolution] =
      await Promise.all([
        this.sumExpenses(prev),
        this.sumDistance(prev),
        this.sumLiters(prev),
        this.sumExpenses(prev, [TripLogType.REPAIR, TripLogType.FINE]),
        this.incidentResolutionAvgHours(prev),
      ]);

    return {
      from: ventana.from.slice(0, 10),
      to: ventana.to.slice(0, 10),
      costPerKm: distance ? Number((expenses / distance).toFixed(2)) : 0,
      fuelEfficiency: distance
        ? Number(((liters / distance) * 100).toFixed(2))
        : 0,
      totalExpenses: expenses,
      totalDistanceKm: distance,
      extraordinaryCosts: extraordinary,
      incidentResolutionAvgHours: resolution,
    };
  }

  /** Ventana de igual duración que termina justo antes de `from`. */
  private ventanaAnterior(from: string, to: string): { from: string; to: string } {
    const desde = this.parseSql(from);
    const hasta = this.parseSql(to);
    const duracion = hasta.getTime() - desde.getTime();
    const fin = new Date(desde.getTime() - 1000);
    const inicio = new Date(fin.getTime() - duracion);
    return { from: this.formatSql(inicio), to: this.formatSql(fin) };
  }

  // ───────── Series temporales ─────────

  /**
   * Evolución del gasto, la distancia, el costo por km y el rendimiento a lo
   * largo del período.
   *
   * Es la dimensión que le faltaba al tablero: los KPIs dicen cuánto, la serie
   * dice hacia dónde. `costPerKm` y `fuelEfficiency` van en `null` —no en 0—
   * cuando el bucket no tuvo kilómetros: un cero dibujaría una caída a piso que
   * no ocurrió, y el gráfico debe cortar la línea ahí.
   */
  async series(f: SeriesFilterDto) {
    const window = resolveDateWindow(f.from, f.to, INDICATORS_WINDOW);
    const filtro = { ...f, ...window };
    const bucket = f.bucket ?? this.bucketPorVentana(window.from, window.to);
    const claves = this.bucketKeys(window.from, window.to, bucket);
    const expr = this.bucketExpr('e.occurredAt', bucket);
    const exprTrip = this.bucketExpr('t.finishedAt', bucket);

    const [gastos, recorridos] = await Promise.all([
      this.expenseQuery(filtro)
        .select(expr, 'k')
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.type != :adv THEN e.amountBase ELSE 0 END),0)',
          'total',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.type = :fuel THEN e.liters ELSE 0 END),0)',
          'liters',
        )
        .setParameters({ adv: TripLogType.CASH_ADVANCE, fuel: TripLogType.FUEL })
        .groupBy(expr)
        .getRawMany(),
      this.tripQuery(filtro)
        .select(exprTrip, 'k')
        .addSelect('COALESCE(SUM(t.distanceKm),0)', 'km')
        .addSelect('COUNT(*)', 'trips')
        .groupBy(exprTrip)
        .getRawMany(),
    ]);

    const gasto = this.indexar(gastos, 'total');
    const litros = this.indexar(gastos, 'liters');
    const km = this.indexar(recorridos, 'km');
    const viajes = this.indexar(recorridos, 'trips');

    return {
      bucket,
      points: claves.map((period) => {
        const expenses = gasto.get(period) ?? 0;
        const distanceKm = km.get(period) ?? 0;
        const liters = litros.get(period) ?? 0;
        return {
          period,
          expenses,
          distanceKm,
          liters,
          trips: viajes.get(period) ?? 0,
          costPerKm: distanceKm
            ? Number((expenses / distanceKm).toFixed(2))
            : null,
          fuelEfficiency: distanceKm
            ? Number(((liters / distanceKm) * 100).toFixed(2))
            : null,
        };
      }),
      coverage: this.coberturaEfectiva(filtro),
    };
  }

  /**
   * Composición del gasto por rubro a lo largo del período (barra apilada).
   *
   * Saber que el gasto subió no alcanza para decidir nada; saber que subió por
   * reparaciones y no por combustible, sí. Las series salen ordenadas de mayor
   * a menor peso en el período para que el apilado no cambie de orden entre
   * consultas.
   */
  async expensesByType(f: SeriesFilterDto) {
    const window = resolveDateWindow(f.from, f.to, INDICATORS_WINDOW);
    const filtro = { ...f, ...window };
    const bucket = f.bucket ?? this.bucketPorVentana(window.from, window.to);
    const periods = this.bucketKeys(window.from, window.to, bucket);
    const expr = this.bucketExpr('e.occurredAt', bucket);

    const rows = await this.expenseQuery(filtro)
      .select(expr, 'k')
      .addSelect('e.type', 'type')
      .addSelect('COALESCE(SUM(e.amountBase),0)', 'total')
      .andWhere('e.type != :adv', { adv: TripLogType.CASH_ADVANCE })
      .groupBy(expr)
      .addGroupBy('e.type')
      .getRawMany();

    const totalPorTipo = new Map<string, number>();
    const valores = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const tipo = r.type ?? 'other';
      const total = Number(r.total);
      totalPorTipo.set(tipo, (totalPorTipo.get(tipo) ?? 0) + total);
      if (!valores.has(tipo)) valores.set(tipo, new Map());
      valores.get(tipo)!.set(r.k, total);
    }

    return {
      bucket,
      periods,
      series: [...totalPorTipo.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key, total]) => ({
          key,
          total,
          data: periods.map((p) => valores.get(key)?.get(p) ?? 0),
        })),
      coverage: this.coberturaEfectiva(filtro),
    };
  }

  /**
   * Costo por km y rendimiento **por camión**.
   *
   * El ranking de gasto absoluto ordena por actividad, no por eficiencia: el
   * camión que más gastó suele ser el que más viajó. Normalizado por kilómetro
   * aparece el camión caro de verdad. Los kilómetros y los viajes viajan con el
   * dato para que una unidad con poco recorrido no se lea como la peor de la
   * flota por un costo por km calculado sobre 200 km.
   */
  async efficiencyByTruck(f: IndicatorFilterDto) {
    const filtro = { ...f, ...resolveDateWindow(f.from, f.to, INDICATORS_WINDOW) };

    const [gastos, recorridos] = await Promise.all([
      this.expenseQuery(filtro)
        .select('truck.plate', 'k')
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.type != :adv THEN e.amountBase ELSE 0 END),0)',
          'total',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.type = :fuel THEN e.liters ELSE 0 END),0)',
          'liters',
        )
        .setParameters({ adv: TripLogType.CASH_ADVANCE, fuel: TripLogType.FUEL })
        .groupBy('truck.plate')
        .getRawMany(),
      this.tripQuery(filtro)
        .select('truck.plate', 'k')
        .addSelect('COALESCE(SUM(t.distanceKm),0)', 'km')
        .addSelect('COUNT(*)', 'trips')
        .groupBy('truck.plate')
        .getRawMany(),
    ]);

    return this.unirPorClave(gastos, recorridos, '-');
  }

  /**
   * Costo por km **por clasificación de ruta** (`trip_classification`).
   *
   * Es el corte que responde la pregunta comercial: si «Ida Brasil» cuesta un
   * 40 % más por kilómetro que «Nacional», eso decide tarifas, no sólo
   * mantenimiento. La clave es la del catálogo de la empresa; `null` son los
   * viajes sin clasificar y el front los rotula.
   */
  async byRoute(f: IndicatorFilterDto) {
    const filtro = { ...f, ...resolveDateWindow(f.from, f.to, INDICATORS_WINDOW) };

    const [gastos, recorridos] = await Promise.all([
      this.expenseQuery(filtro)
        .select('t.classification', 'k')
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.type != :adv THEN e.amountBase ELSE 0 END),0)',
          'total',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.type = :fuel THEN e.liters ELSE 0 END),0)',
          'liters',
        )
        .setParameters({ adv: TripLogType.CASH_ADVANCE, fuel: TripLogType.FUEL })
        .groupBy('t.classification')
        .getRawMany(),
      this.tripQuery(filtro)
        .select('t.classification', 'k')
        .addSelect('COALESCE(SUM(t.distanceKm),0)', 'km')
        .addSelect('COUNT(*)', 'trips')
        .groupBy('t.classification')
        .getRawMany(),
    ]);

    return this.unirPorClave(gastos, recorridos, null);
  }

  // ───────── Utilidades de agregación ─────────

  /**
   * Cruza el agregado de gastos con el de recorridos por la misma clave y
   * calcula los ratios. Son dos consultas y no una porque los kilómetros viven
   * en el viaje y los gastos en la bitácora: unirlas en SQL multiplicaría los
   * kilómetros por la cantidad de movimientos del viaje.
   */
  private unirPorClave(
    gastos: any[],
    recorridos: any[],
    claveVacia: string | null,
  ) {
    const total = this.indexar(gastos, 'total');
    const litros = this.indexar(gastos, 'liters');
    const km = this.indexar(recorridos, 'km');
    const viajes = this.indexar(recorridos, 'trips');

    const claves = new Set<string>([...total.keys(), ...km.keys()]);
    const filas = [...claves].map((clave) => {
      const expenses = total.get(clave) ?? 0;
      const distanceKm = km.get(clave) ?? 0;
      const liters = litros.get(clave) ?? 0;
      return {
        key: clave === NULO ? claveVacia : clave,
        expenses,
        distanceKm,
        liters,
        trips: viajes.get(clave) ?? 0,
        costPerKm: distanceKm ? Number((expenses / distanceKm).toFixed(2)) : null,
        fuelEfficiency: distanceKm
          ? Number(((liters / distanceKm) * 100).toFixed(2))
          : null,
      };
    });

    // Mayor costo por km primero; los que no tienen kilómetros —gasto sin
    // recorrido, típicamente un camión en taller— quedan al final.
    return filas.sort((a, b) => (b.costPerKm ?? -1) - (a.costPerKm ?? -1));
  }

  /** Filas crudas `{ k, <campo> }` a mapa clave → número. */
  private indexar(rows: any[], campo: string): Map<string, number> {
    return new Map(rows.map((r) => [r.k ?? NULO, Number(r[campo] ?? 0)]));
  }

  /** Paso de la serie cuando el pedido no lo fija. */
  private bucketPorVentana(from: string, to: string): SeriesBucket {
    const dias =
      Math.round(
        (this.parseSql(to).getTime() - this.parseSql(from).getTime()) / DIA_MS,
      ) + 1;
    if (dias <= 21) return 'day';
    if (dias <= 120) return 'week';
    return 'month';
  }

  /**
   * Expresión SQL que asigna cada fila a su bucket. La etiqueta que produce
   * tiene que coincidir carácter por carácter con la que arma `bucketKeys`: es
   * la clave con la que se cruzan el SQL y el relleno de huecos.
   */
  private bucketExpr(col: string, bucket: SeriesBucket): string {
    if (bucket === 'month') return `DATE_FORMAT(${col}, '%Y-%m')`;
    // La semana se etiqueta con su lunes: así ordena como fecha y se puede
    // formatear en el front sin conocer la convención de numeración de semanas.
    if (bucket === 'week')
      return `DATE_FORMAT(DATE_SUB(${col}, INTERVAL WEEKDAY(${col}) DAY), '%Y-%m-%d')`;
    return `DATE_FORMAT(${col}, '%Y-%m-%d')`;
  }

  /**
   * Todas las etiquetas de bucket de la ventana, en orden. El SQL sólo devuelve
   * los buckets con datos; la serie tiene que incluir los vacíos o el gráfico
   * comprime el tiempo y muestra una tendencia que no existe.
   */
  private bucketKeys(from: string, to: string, bucket: SeriesBucket): string[] {
    const inicio = this.parseSql(from);
    const fin = this.parseSql(to);
    const claves: string[] = [];

    if (bucket === 'month') {
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
      while (d <= fin) {
        claves.push(`${d.getFullYear()}-${this.pad(d.getMonth() + 1)}`);
        d.setMonth(d.getMonth() + 1);
      }
      return claves;
    }

    const d = new Date(inicio);
    // Lunes de la semana del inicio (getDay(): 0 = domingo).
    if (bucket === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    while (d <= fin) {
      claves.push(this.soloFecha(d));
      d.setDate(d.getDate() + (bucket === 'week' ? 7 : 1));
    }
    return claves;
  }

  private parseSql(v: string): Date {
    return new Date(v.replace(' ', 'T'));
  }

  private formatSql(d: Date): string {
    return `${this.soloFecha(d)} ${this.pad(d.getHours())}:${this.pad(
      d.getMinutes(),
    )}:${this.pad(d.getSeconds())}`;
  }

  private soloFecha(d: Date): string {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  async exportXlsx(f: IndicatorFilterDto): Promise<Buffer> {
    // El summary trae solo el top 10; para el Excel exportamos las listas completas.
    const [s, byTruck, byDriver, efficiency, routes] = await Promise.all([
      this.summary(f),
      this.expensesByGroup(f, 'truck'),
      this.expensesByGroup(f, 'driver'),
      this.efficiencyByTruck(f),
      this.byRoute(f),
    ]);
    const wb = XLSX.utils.book_new();

    const resumen = [
      { Indicador: 'Gasto por km', Valor: s.costPerKm },
      { Indicador: 'Rendimiento (l/100km)', Valor: s.fuelEfficiency },
      { Indicador: 'Gastos totales', Valor: s.totalExpenses },
      { Indicador: 'Distancia total (km)', Valor: s.totalDistanceKm },
      { Indicador: 'Costos extraordinarios', Valor: s.extraordinaryCosts },
      { Indicador: 'Prom. resolución incidentes (h)', Valor: s.incidentResolutionAvgHours },
      { Indicador: 'Disponibilidad de flota (%)', Valor: s.fleetAvailabilityPct },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(byTruck.map((x) => ({ Camion: x.key, Gasto: x.total }))),
      'Gasto x camión',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(byDriver.map((x) => ({ Chofer: x.key, Gasto: x.total }))),
      'Gasto x chofer',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(s.breakdownsByTruck.map((x) => ({ Camion: x.key, Roturas: x.count }))),
      'Roturas',
    );
    // Normalizado por kilómetro: es la hoja que sirve para comparar unidades
    // entre sí, a diferencia del gasto absoluto, que ordena por actividad.
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        efficiency.map((x) => ({
          Camion: x.key,
          Gasto: x.expenses,
          Km: x.distanceKm,
          Viajes: x.trips,
          'Costo x km': x.costPerKm,
          'l/100km': x.fuelEfficiency,
        })),
      ),
      'Costo x km',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        routes.map((x) => ({
          Ruta: x.key ?? 'Sin clasificar',
          Viajes: x.trips,
          Km: x.distanceKm,
          Gasto: x.expenses,
          'Costo x km': x.costPerKm,
        })),
      ),
      'Por ruta',
    );

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
