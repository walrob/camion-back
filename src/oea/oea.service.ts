import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { OeaInspection } from './entities/oea-inspection.entity';
import { OeaInspectionItem } from './entities/oea-inspection-item.entity';
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
      items: DEFAULT_OEA_ITEMS.map((i) =>
        this.itemsRepository.create({
          key: i.key,
          label: i.label,
          section: i.section,
        }),
      ),
    });
    return this.inspectionsRepository.save(inspection);
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
      searchFields: [],
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

  private async assertEditable(
    inspection: OeaInspection,
    user: ActiveUserInterface,
  ) {
    if (user.role !== Role.DRIVER) return;
    const driver = await this.driversService.findByUserId(user.id);
    if (inspection.driverId !== driver.id) {
      throw new ForbiddenException('Esta planilla no corresponde a su perfil.');
    }
  }
}
