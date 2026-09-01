import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Checklist } from './entities/checklist.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-item.dto';
import { SignChecklistDto } from './dto/sign-checklist.dto';
import {
  ChecklistItemStatus,
  ChecklistResult,
} from 'src/common/enums/checklist.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { DriversService } from 'src/drivers/drivers.service';
import { assertNoCerrado } from 'src/common/utils/registro-cerrado.util';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { AttachmentsService } from 'src/common/attachments/attachments.service';
import { Truck } from 'src/fleet/entities/truck.entity';

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    @InjectRepository(ChecklistItem)
    private readonly itemsRepository: Repository<ChecklistItem>,
    // Sólo para conocer el tipo de la unidad y elegir la plantilla.
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    private readonly driversService: DriversService,
    private readonly templatesService: ChecklistTemplatesService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  /** Crea (o devuelve si ya existe) el checklist de un viaje con la plantilla. */
  async createForTrip(
    dto: CreateChecklistDto,
    user: ActiveUserInterface,
  ): Promise<Checklist> {
    await this.assertDriver(dto.driverId, user);

    const existing = await this.checklistsRepository.findOne({
      where: { tripId: dto.tripId },
      relations: ['items'],
    });
    if (existing) return existing;

    // Los puntos salen de la plantilla de la empresa —por tipo de unidad si la
    // hay— y, si nunca configuró ninguna, de la constante de siempre.
    const truck = await this.trucksRepository.findOne({
      where: { id: dto.truckId },
      select: { id: true, type: true },
    });
    const puntos = await this.templatesService.puntosPara(truck?.type);

    const checklist = this.checklistsRepository.create({
      tripId: dto.tripId,
      truckId: dto.truckId,
      driverId: dto.driverId,
      createdBy: user.id,
      // Copia, no referencia: si la plantilla cambia mañana, este checklist
      // sigue mostrando con qué se revisó la unidad hoy.
      items: puntos.map((p) =>
        this.itemsRepository.create({
          key: p.key,
          label: p.label,
          order: p.order,
          isCritical: p.isCritical,
          requiresPhotoOnFail: p.requiresPhotoOnFail,
        }),
      ),
    });
    return this.checklistsRepository.save(checklist);
  }

  async getByTrip(tripId: string): Promise<Checklist | null> {
    return this.checklistsRepository.findOne({
      where: { tripId },
      relations: ['items'],
      order: { items: { createdAt: 'ASC' } },
    });
  }

  async updateItem(
    itemId: string,
    dto: UpdateChecklistItemDto,
    user: ActiveUserInterface,
  ): Promise<ChecklistItem> {
    const item = await this.itemsRepository.findOne({
      where: { id: itemId },
      relations: ['checklist'],
    });
    if (!item) throw new NotFoundException('Ítem de checklist no encontrado.');
    await this.assertDriver(item.checklist.driverId, user);
    this.assertNoFirmado(item.checklist);

    Object.assign(item, dto);
    return this.itemsRepository.save(item);
  }

  async sign(
    id: string,
    dto: SignChecklistDto,
    user: ActiveUserInterface,
  ): Promise<Checklist> {
    const checklist = await this.findOne(id);
    await this.assertDriver(checklist.driverId, user);
    this.assertNoFirmado(checklist);

    const fallados = checklist.items.filter(
      (i) => i.status === ChecklistItemStatus.FAIL,
    );

    // Si la empresa marcó un punto como "requiere foto en falla", la foto es
    // parte del registro: firmar sin ella deja una falla sin respaldo, que es
    // justamente lo que después no se puede reconstruir.
    const sinFoto: string[] = [];
    for (const item of fallados.filter((i) => i.requiresPhotoOnFail)) {
      const adjuntos = await this.attachmentsService.listByEntity(
        'checklist_item',
        item.id,
      );
      if (!adjuntos.length) sinFoto.push(item.label);
    }
    if (sinFoto.length) {
      throw new BadRequestException(
        `Falta la foto de: ${sinFoto.join(', ')}. Sacá la foto de la falla antes de firmar.`,
      );
    }

    // Una falla en un punto crítico rechaza el checklist. Antes toda firma
    // aprobaba, con lo cual "aprobado" no significaba nada.
    const critico = fallados.some((i) => i.isCritical);

    checklist.signatureKey = dto.signatureKey;
    checklist.signedAt = new Date();
    checklist.result = critico
      ? ChecklistResult.REJECTED
      : ChecklistResult.APPROVED;
    checklist.updatedBy = user.id;
    return this.checklistsRepository.save(checklist);
  }

  /** Usado por trips para bloquear el inicio si no está aprobado. */
  async isApprovedForTrip(tripId: string): Promise<boolean> {
    const checklist = await this.checklistsRepository.findOne({
      where: { tripId },
    });
    return checklist?.result === ChecklistResult.APPROVED;
  }

  async findOne(id: string): Promise<Checklist> {
    const checklist = await this.checklistsRepository.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!checklist) throw new NotFoundException('Checklist no encontrado.');
    return checklist;
  }

  /**
   * Un checklist firmado no se modifica, ni por el chofer ni por la oficina, y
   * tampoco se vuelve a firmar.
   *
   * Es el registro que respalda que la unidad salió en condiciones: si los
   * ítems se pueden cambiar después de la firma, la firma no prueba nada y el
   * papel no sirve ante la CNRT ni ante un siniestro. Por eso acá no hay
   * reapertura: el error se corrige con un checklist nuevo del viaje, no
   * editando el viejo.
   */
  private assertNoFirmado(checklist: Checklist) {
    assertNoCerrado(
      !!checklist.signedAt,
      'El checklist ya está firmado y no puede modificarse. Si algo quedó mal, ' +
        'avisá al despacho para que se registre en la bitácora del viaje.',
    );
  }

  private async assertDriver(driverId: string, user: ActiveUserInterface) {
    const driver = await this.driversService.findByUserId(user.id);
    if (driver.id !== driverId) {
      throw new ForbiddenException('Este checklist no corresponde a su perfil.');
    }
  }
}
