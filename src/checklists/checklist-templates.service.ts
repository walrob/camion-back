import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ChecklistTemplate } from './entities/checklist-template.entity';
import { ChecklistTemplateItem } from './entities/checklist-template-item.entity';
import { SaveChecklistTemplateDto } from './dto/save-checklist-template.dto';
import { DEFAULT_CHECKLIST_ITEMS } from 'src/common/enums/checklist.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { PlanContextService } from 'src/plans/plan-context.service';
import { Feature } from 'src/common/enums/feature.enum';
import { getCurrentCompanyId } from 'src/common/tenant/tenant-context';

/** Ítem tal como lo consume la creación de un checklist. */
export interface PuntoDeChecklist {
  key: string;
  label: string;
  order: number;
  isCritical: boolean;
  requiresPhotoOnFail: boolean;
}

@Injectable()
export class ChecklistTemplatesService {
  constructor(
    @InjectRepository(ChecklistTemplate)
    private readonly templatesRepository: Repository<ChecklistTemplate>,
    @InjectRepository(ChecklistTemplateItem)
    private readonly itemsRepository: Repository<ChecklistTemplateItem>,
    private readonly planContext: PlanContextService,
  ) {}

  list(): Promise<ChecklistTemplate[]> {
    return this.templatesRepository.find({
      relations: ['items'],
      order: { createdAt: 'ASC', items: { order: 'ASC' } },
    });
  }

  async findOne(id: string): Promise<ChecklistTemplate> {
    const template = await this.templatesRepository.findOne({
      where: { id },
      relations: ['items'],
      order: { items: { order: 'ASC' } },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada.');
    return template;
  }

  /**
   * Los puntos con los que se arma el checklist de un camión.
   *
   * Orden de resolución: plantilla del tipo de unidad → plantilla general de la
   * empresa → la constante del código. Ese último escalón es lo que hace que
   * una empresa que nunca entró a configurar nada siga teniendo su checklist de
   * siempre (docs/CONFIGURACION.md §2.1).
   */
  async puntosPara(vehicleType?: string | null): Promise<PuntoDeChecklist[]> {
    const activas = await this.templatesRepository.find({
      where: { isActive: true },
      relations: ['items'],
      order: { items: { order: 'ASC' } },
    });

    const elegida =
      (vehicleType && activas.find((t) => t.vehicleType === vehicleType)) ||
      activas.find((t) => !t.vehicleType);

    const items = (elegida?.items ?? []).filter((i) => i.isActive);
    if (!items.length) return this.puntosPorDefecto();

    return items
      .sort((a, b) => a.order - b.order)
      .map((i) => ({
        key: i.key,
        label: i.label,
        order: i.order,
        isCritical: i.isCritical,
        requiresPhotoOnFail: i.requiresPhotoOnFail,
      }));
  }

  /** Los siete puntos del código, en formato de plantilla. */
  puntosPorDefecto(): PuntoDeChecklist[] {
    return DEFAULT_CHECKLIST_ITEMS.map((item, i) => ({
      key: item.key,
      label: item.label,
      order: i,
      isCritical: false,
      requiresPhotoOnFail: false,
    }));
  }

  /**
   * Alta y edición van por el mismo camino: la pantalla manda la plantilla
   * entera con sus ítems, que es como se la edita. Los ítems se reemplazan en
   * bloque —son parte de la plantilla, no entidades con vida propia—, y lo que
   * ya se emitió no se toca: cada checklist guarda su copia.
   */
  async save(
    dto: SaveChecklistTemplateDto,
    user: ActiveUserInterface,
    id?: string,
  ): Promise<ChecklistTemplate> {
    this.assertClavesUnicas(dto);
    await this.assertPlanPermiteTipo(dto.vehicleType ?? null);
    await this.assertTipoLibre(dto.vehicleType ?? null, id);

    const template = id
      ? await this.findOne(id)
      : this.templatesRepository.create({ createdBy: user.id });

    template.name = dto.name;
    template.vehicleType = dto.vehicleType || null;
    template.isActive = dto.isActive ?? true;
    template.updatedBy = user.id;
    const guardada = await this.templatesRepository.save(template);

    if (id) await this.itemsRepository.delete({ templateId: guardada.id });
    await this.itemsRepository.save(
      dto.items.map((item, i) =>
        this.itemsRepository.create({
          templateId: guardada.id,
          key: item.key,
          label: item.label,
          order: item.order ?? i,
          isCritical: item.isCritical ?? false,
          requiresPhotoOnFail: item.requiresPhotoOnFail ?? false,
          isActive: item.isActive ?? true,
        }),
      ),
    );

    return this.findOne(guardada.id);
  }

  async remove(id: string, user: ActiveUserInterface): Promise<void> {
    const template = await this.findOne(id);
    template.updatedBy = user.id;
    await this.templatesRepository.save(template);
    // Borrado lógico: los checklists viejos no dependen de esto —guardan su
    // copia— pero recuperar una plantilla borrada por error no debería implicar
    // volver a tipear treinta ítems.
    await this.templatesRepository.softRemove(template);
  }

  private assertClavesUnicas(dto: SaveChecklistTemplateDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('La plantilla necesita al menos un ítem.');
    }
    const claves = dto.items.map((i) => i.key);
    if (new Set(claves).size !== claves.length) {
      throw new BadRequestException(
        'Hay ítems con la misma clave: cada punto tiene que tener una distinta.',
      );
    }
  }

  /**
   * Tener **una** plantilla propia entra con el plan Operación; tener una
   * distinta por tipo de unidad es de Gestión (MODELO-COMERCIAL §4.1).
   *
   * Va en el servicio y no en el controlador porque no depende del endpoint
   * sino del contenido: la misma llamada es válida o no según si la plantilla
   * lleva tipo.
   */
  private async assertPlanPermiteTipo(vehicleType: string | null) {
    if (!vehicleType) return;

    const companyId = getCurrentCompanyId();
    if (!companyId) return;

    const contexto = await this.planContext.obtener(companyId);
    if (!contexto?.features?.includes(Feature.CHECKLIST_BY_TYPE)) {
      throw new ForbiddenException(
        'Las plantillas por tipo de unidad están disponibles desde el plan Gestión. ' +
          'Con tu plan podés tener una plantilla general para toda la flota.',
      );
    }
  }

  /**
   * Una sola plantilla por tipo de unidad (y una sola general). Con dos, la
   * resolución de `puntosPara` sería un sorteo y nadie sabría con qué checklist
   * va a salir el camión.
   */
  private async assertTipoLibre(vehicleType: string | null, id?: string) {
    const existente = await this.templatesRepository.findOne({
      where: { vehicleType: vehicleType ?? IsNull() },
    });
    if (existente && existente.id !== id) {
      throw new BadRequestException(
        vehicleType
          ? `Ya hay una plantilla para el tipo «${vehicleType}».`
          : 'Ya hay una plantilla general. Editá esa o creá una por tipo de unidad.',
      );
    }
  }
}
