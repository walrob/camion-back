import {
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
  ChecklistResult,
  DEFAULT_CHECKLIST_ITEMS,
} from 'src/common/enums/checklist.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { DriversService } from 'src/drivers/drivers.service';
import { assertNoCerrado } from 'src/common/utils/registro-cerrado.util';

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    @InjectRepository(ChecklistItem)
    private readonly itemsRepository: Repository<ChecklistItem>,
    private readonly driversService: DriversService,
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

    const checklist = this.checklistsRepository.create({
      tripId: dto.tripId,
      truckId: dto.truckId,
      driverId: dto.driverId,
      createdBy: user.id,
      items: DEFAULT_CHECKLIST_ITEMS.map((i) =>
        this.itemsRepository.create({ key: i.key, label: i.label }),
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

    checklist.signatureKey = dto.signatureKey;
    checklist.signedAt = new Date();
    checklist.result = ChecklistResult.APPROVED;
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
