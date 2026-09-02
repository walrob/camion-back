import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { OeaInspection } from './entities/oea-inspection.entity';
import { OeaInspectionItem } from './entities/oea-inspection-item.entity';
import { OeaTemplateItem } from './entities/oea-template-item.entity';
import { CreateOeaInspectionDto } from './dto/create-oea-inspection.dto';
import { UpdateOeaInspectionDto } from './dto/update-oea-inspection.dto';
import { UpdateOeaItemDto } from './dto/update-oea-item.dto';
import { SignOeaDto } from './dto/sign-oea.dto';
import { OeaFilterDto } from './dto/oea-filter.dto';
import {
  DEFAULT_OEA_ITEMS,
  OeaItemStatus,
  OeaResult,
} from 'src/common/enums/oea.enum';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { DriversService } from 'src/drivers/drivers.service';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';
import { resolveSort } from 'src/common/utils/resolve-sort.util';
import { assertNoCerrado } from 'src/common/utils/registro-cerrado.util';

// Columnas ordenables (clave del front → columna/alias real).
const OEA_SORTABLE: Record<string, string> = {
  inspectedAt: 'inspectedAt',
  'truck.plate': 'truck.plate',
  tripNumber: 'tripNumber',
  result: 'result',
  createdAt: 'createdAt',
};

@Injectable()
export class OeaService {
  constructor(
    @InjectRepository(OeaInspection)
    private readonly inspectionsRepository: Repository<OeaInspection>,
    @InjectRepository(OeaInspectionItem)
    private readonly itemsRepository: Repository<OeaInspectionItem>,
    @InjectRepository(OeaTemplateItem)
    private readonly templateRepository: Repository<OeaTemplateItem>,
    private readonly driversService: DriversService,
  ) {}

  async create(
    dto: CreateOeaInspectionDto,
    user: ActiveUserInterface,
  ): Promise<OeaInspection> {
    // Idempotencia para sync offline.
    if (dto.clientId) {
      const existing = await this.inspectionsRepository.findOne({
        where: { clientId: dto.clientId },
        relations: ['items'],
      });
      if (existing) return existing;
    }

    // Si la completa un chofer, se fuerza su propio perfil.
    let driverId = dto.driverId;
    if (user.role === Role.DRIVER) {
      const driver = await this.driversService.findByUserId(user.id);
      driverId = driver.id;
    }
    if (!driverId) {
      throw new NotFoundException('Debe indicar el chofer de la inspección.');
    }

    const inspection = this.inspectionsRepository.create({
      ...dto,
      driverId,
      createdBy: user.id,
      // Los 7 puntos AFIP + precintos van siempre; después, lo que la empresa
      // haya sumado a su planilla (docs/CONFIGURACION.md §6.2).
      items: (await this.puntosDeLaPlanilla()).map((i) =>
        this.itemsRepository.create({
          key: i.key,
          label: i.label,
          section: i.section,
        }),
      ),
    });
    return this.inspectionsRepository.save(inspection);
  }

  // ───────── Plantilla de la empresa ─────────

  /**
   * Los puntos con los que se arma una planilla: el piso normativo primero, y
   * después los propios de la empresa.
   *
   * El piso **no se toca**: los 7 puntos AFIP y los precintos son lo que exige
   * la norma, no una preferencia. Lo configurable es lo que se agrega.
   */
  async puntosDeLaPlanilla(): Promise<
    { key: string; label: string; section: string; isSystem: boolean }[]
  > {
    const propios = await this.templateRepository.find({
      where: { isActive: true },
      order: { order: 'ASC' },
    });

    return [
      ...DEFAULT_OEA_ITEMS.map((i) => ({
        key: i.key as string,
        label: i.label,
        section: i.section as string,
        isSystem: true,
      })),
      ...propios.map((i) => ({
        key: i.key,
        label: i.label,
        section: i.section,
        isSystem: false,
      })),
    ];
  }

  /** Lo que muestra la pantalla de configuración: piso + propios, con estado. */
  async plantilla() {
    const propios = await this.templateRepository.find({ order: { order: 'ASC' } });
    return {
      base: DEFAULT_OEA_ITEMS.map((i) => ({
        key: i.key as string,
        label: i.label,
        section: i.section as string,
      })),
      propios: propios.map((i) => ({
        key: i.key,
        label: i.label,
        section: i.section,
        order: i.order,
        isActive: i.isActive,
      })),
    };
  }

  /**
   * Reemplaza los puntos propios. Los que salen de la lista se **desactivan**:
   * una planilla firmada el mes pasado tiene que seguir explicando qué se
   * revisó.
   */
  async guardarPlantilla(
    items: {
      key: string;
      label: string;
      section: string;
      order?: number;
      isActive?: boolean;
    }[],
    user: ActiveUserInterface,
  ) {
    const claves = items.map((i) => i.key);
    if (new Set(claves).size !== claves.length) {
      throw new BadRequestException(
        'Hay puntos con la misma clave: cada uno tiene que tener una distinta.',
      );
    }
    const chocaConLaNorma = claves.find((k) =>
      DEFAULT_OEA_ITEMS.some((d) => (d.key as string) === k),
    );
    if (chocaConLaNorma) {
      throw new BadRequestException(
        `«${chocaConLaNorma}» ya es un punto de la norma: no se puede duplicar.`,
      );
    }

    const guardados = await this.templateRepository.find();

    for (const [i, item] of items.entries()) {
      let fila = guardados.find((g) => g.key === item.key);
      if (!fila) fila = this.templateRepository.create({ key: item.key });
      fila.label = item.label;
      fila.section = item.section;
      fila.order = item.order ?? i;
      fila.isActive = item.isActive ?? true;
      fila.updatedBy = user.id;
      await this.templateRepository.save(fila);
    }

    for (const fila of guardados) {
      if (claves.includes(fila.key) || !fila.isActive) continue;
      fila.isActive = false;
      fila.updatedBy = user.id;
      await this.templateRepository.save(fila);
    }

    return this.plantilla();
  }

  paginate(
    options: IPaginationOptions,
    filter: OeaFilterDto,
  ): Promise<Pagination<OeaInspection>> {
    const sort = resolveSort(filter.sortBy, filter.order, OEA_SORTABLE, {
      orderBy: 'inspectedAt',
      order: 'DESC',
    });
    return paginateAndSearch<OeaInspection>(this.inspectionsRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search: filter.search,
      // Alias del query builder: las relaciones anidadas reemplazan el punto por
      // guión bajo ('driver.employee' → 'driver_employee').
      searchFields: [
        'truck.plate',
        'driver_employee.firstName',
        'driver_employee.lastName',
        'tripNumber',
      ],
      orderBy: sort.orderBy,
      order: sort.order,
      dateField: 'inspectedAt',
      from: filter.from,
      to: filter.to,
      relations: ['truck', 'driver', 'driver.employee'],
      baseWhere: {
        ...(filter.truckId && { truckId: filter.truckId }),
        ...(filter.driverId && { driverId: filter.driverId }),
        ...(filter.result && { result: filter.result }),
      },
    });
  }

  async listMine(userId: string): Promise<OeaInspection[]> {
    const driver = await this.driversService.findByUserId(userId);
    return this.inspectionsRepository.find({
      where: { driverId: driver.id },
      relations: ['truck'],
      order: { inspectedAt: 'DESC' },
    });
  }

  getByTrip(tripId: string): Promise<OeaInspection | null> {
    return this.inspectionsRepository.findOne({
      where: { tripId },
      relations: ['items', 'truck', 'driver', 'driver.employee'],
      order: { items: { createdAt: 'ASC' } },
    });
  }

  /**
   * ¿El viaje tiene su planilla OEA firmada y conforme?
   *
   * Lo consulta viajes cuando la empresa activó «exigir OEA para iniciar»
   * (docs/CONFIGURACION.md §4.2). Sin relaciones ni ítems: es una pregunta de
   * sí o no que se hace justo cuando el chofer aprieta Iniciar.
   */
  async isConformeForTrip(tripId: string): Promise<boolean> {
    const inspection = await this.inspectionsRepository.findOne({
      where: { tripId },
      select: { id: true, result: true },
    });
    return inspection?.result === OeaResult.CONFORME;
  }

  async findOne(id: string): Promise<OeaInspection> {
    const inspection = await this.inspectionsRepository.findOne({
      where: { id },
      relations: ['items', 'truck', 'driver', 'driver.employee'],
      order: { items: { createdAt: 'ASC' } },
    });
    if (!inspection) throw new NotFoundException('Planilla OEA no encontrada.');
    return inspection;
  }

  async update(
    id: string,
    dto: UpdateOeaInspectionDto,
    user: ActiveUserInterface,
  ): Promise<OeaInspection> {
    const inspection = await this.findOne(id);
    await this.assertEditable(inspection, user);
    Object.assign(inspection, dto, { updatedBy: user.id });
    return this.inspectionsRepository.save(inspection);
  }

  async updateItem(
    itemId: string,
    dto: UpdateOeaItemDto,
    user: ActiveUserInterface,
  ): Promise<OeaInspectionItem> {
    const item = await this.itemsRepository.findOne({
      where: { id: itemId },
      relations: ['inspection'],
    });
    if (!item) throw new NotFoundException('Ítem de la planilla no encontrado.');
    await this.assertEditable(item.inspection, user);

    Object.assign(item, dto);
    return this.itemsRepository.save(item);
  }

  async sign(
    id: string,
    dto: SignOeaDto,
    user: ActiveUserInterface,
  ): Promise<OeaInspection> {
    const inspection = await this.findOne(id);
    await this.assertEditable(inspection, user);

    inspection.signatureKey = dto.signatureKey;
    inspection.signedAt = new Date();
    inspection.result = dto.result ?? this.resolveResult(inspection.items);
    inspection.updatedBy = user.id;
    return this.inspectionsRepository.save(inspection);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const inspection = await this.findOne(id);
    await this.assertEditable(inspection, user);
    inspection.deletedBy = user.id;
    await this.inspectionsRepository.save(inspection);
    return this.inspectionsRepository.softDelete(id);
  }

  /** Si algún ítem quedó observado, la planilla es no conforme. */
  private resolveResult(items: OeaInspectionItem[]): OeaResult {
    const hasObserved = items?.some(
      (i) => i.status === OeaItemStatus.OBSERVED,
    );
    return hasObserved ? OeaResult.NO_CONFORME : OeaResult.CONFORME;
  }

  /**
   * Quién puede tocar la planilla y hasta cuándo.
   *
   * Dos controles distintos, y el orden importa:
   *
   *  - **Firmada, nadie.** La planilla OEA firmada es el comprobante de los 7
   *    puntos ante AFIP. Editarla o borrarla después de la firma convierte el
   *    control en un papel que dice lo que convenga; si está mal, se hace una
   *    planilla nueva del viaje. Esto alcanza también al admin: no es un tema
   *    de permisos sino de qué vale el documento.
   *  - **Sin firmar, sólo el dueño.** El chofer únicamente la suya; la oficina,
   *    cualquiera de la empresa.
   */
  private async assertEditable(
    inspection: OeaInspection,
    user: ActiveUserInterface,
  ) {
    assertNoCerrado(
      !!inspection.signedAt,
      'La planilla OEA ya está firmada: no puede modificarse ni eliminarse. ' +
        'Si hay un error, registrá una planilla nueva para el viaje.',
    );

    if (user.role !== Role.DRIVER) return;
    const driver = await this.driversService.findByUserId(user.id);
    if (inspection.driverId !== driver.id) {
      throw new ForbiddenException('Esta planilla no corresponde a su perfil.');
    }
  }
}
