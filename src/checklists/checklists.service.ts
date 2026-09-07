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
import { ChecklistCompanion } from './entities/checklist-companion.entity';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-item.dto';
import { SignChecklistDto } from './dto/sign-checklist.dto';
import { SaveCompanionDto } from './dto/save-companion.dto';
import { ValidateChecklistDto } from './dto/validate-checklist.dto';
import {
  ChecklistItemStatus,
  ChecklistItemType,
  ChecklistResult,
  statusDesdeRespuesta,
} from 'src/common/enums/checklist.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { DriversService } from 'src/drivers/drivers.service';
import { assertNoCerrado } from 'src/common/utils/registro-cerrado.util';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { AttachmentsService } from 'src/common/attachments/attachments.service';
import { Truck } from 'src/fleet/entities/truck.entity';
import { SettingsService } from 'src/settings/settings.service';
import { SETTING } from 'src/settings/settings.catalog';
import { AlertsService } from 'src/alerts/alerts.service';
import { Employee } from 'src/hr/entities/employee.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Document } from 'src/documents/entities/document.entity';
import {
  DocumentCategory,
  DocumentOwnerType,
} from 'src/common/enums/document.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';

/** Entidad contra la que se adjuntan las fotos de un punto. */
const ENTIDAD_ITEM = 'checklist_item';

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    @InjectRepository(ChecklistItem)
    private readonly itemsRepository: Repository<ChecklistItem>,
    @InjectRepository(ChecklistCompanion)
    private readonly companionsRepository: Repository<ChecklistCompanion>,
    // Sólo para conocer el tipo de la unidad y elegir la plantilla.
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    // Los tres entran como entidades y no como servicios: alcanza con leerlos
    // para resolver el acompañante que ya está en el sistema, y traer HrModule,
    // DriversModule entero y DocumentsModule sólo para eso acoplaría checklists
    // a media aplicación.
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly driversService: DriversService,
    private readonly templatesService: ChecklistTemplatesService,
    private readonly attachmentsService: AttachmentsService,
    private readonly settings: SettingsService,
    private readonly alertsService: AlertsService,
  ) {}

  /** Crea (o devuelve si ya existe) el checklist de un viaje con la plantilla. */
  async createForTrip(
    dto: CreateChecklistDto,
    user: ActiveUserInterface,
  ): Promise<Checklist> {
    await this.assertDriver(dto.driverId, user);

    // Idempotencia para el sync offline: un reintento del alta no puede dejar
    // dos planillas del mismo viaje.
    if (dto.clientId) {
      const porCliente = await this.checklistsRepository.findOne({
        where: { clientId: dto.clientId },
        relations: ['items', 'companions'],
      });
      if (porCliente) return porCliente;
    }

    const existing = await this.checklistsRepository.findOne({
      where: { tripId: dto.tripId },
      relations: ['items', 'companions'],
    });
    if (existing) return existing;

    // Los puntos salen de la plantilla de la empresa —por tipo de unidad si la
    // hay— y, si nunca configuró ninguna, de la constante de siempre.
    const truck = await this.trucksRepository.findOne({
      where: { id: dto.truckId },
      select: { id: true, type: true },
    });
    const { template, puntos } = await this.templatesService.plantillaPara(
      truck?.type,
    );

    const checklist = this.checklistsRepository.create({
      tripId: dto.tripId,
      truckId: dto.truckId,
      trailerId: dto.trailerId,
      driverId: dto.driverId,
      clientId: dto.clientId,
      createdBy: user.id,
      // Copia, no referencia: si la plantilla cambia mañana, este checklist
      // sigue mostrando con qué se revisó la unidad hoy. Se copia también la
      // identidad del formulario, que es por lo que pregunta una auditoría.
      templateId: template?.id,
      templateCode: template?.code ?? null,
      templateRevision: template?.revision ?? null,
      items: puntos.map((p) =>
        this.itemsRepository.create({
          key: p.key,
          label: p.label,
          section: p.section,
          helpText: p.helpText,
          type: p.type,
          expectedAnswer: p.expectedAnswer,
          order: p.order,
          isCritical: p.isCritical,
          requiresPhotoOnFail: p.requiresPhotoOnFail,
          requiresPhoto: p.requiresPhoto,
          minPhotos: p.minPhotos,
          maxPhotos: p.maxPhotos,
          requiresValidationOnFail: p.requiresValidationOnFail,
        }),
      ),
    });
    return this.checklistsRepository.save(checklist);
  }

  async getByTrip(tripId: string): Promise<Checklist | null> {
    return this.checklistsRepository.findOne({
      where: { tripId },
      relations: ['items', 'companions'],
      order: { items: { order: 'ASC', createdAt: 'ASC' } },
    });
  }

  /** Datos de cabecera: furgón, acompañante declarado, observación, ubicación. */
  async update(
    id: string,
    dto: UpdateChecklistDto,
    user: ActiveUserInterface,
  ): Promise<Checklist> {
    const checklist = await this.findOne(id);
    await this.assertDriver(checklist.driverId, user);
    this.assertNoFirmado(checklist);

    if (dto.hasCompanion && !(await this.acompanantesPermitidos())) {
      throw new BadRequestException(
        'Tu empresa no permite declarar acompañantes en la planilla.',
      );
    }

    Object.assign(checklist, dto);
    checklist.updatedBy = user.id;
    return this.checklistsRepository.save(checklist);
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

    const { answer, ...resto } = dto;
    Object.assign(item, resto);

    // Qué significa la respuesta lo decide el servidor, no el cliente: es la
    // regla que termina definiendo si el camión sale.
    if (answer !== undefined) {
      item.answer = answer;
      item.status = statusDesdeRespuesta(answer, item.expectedAnswer);
    }

    return this.itemsRepository.save(item);
  }

  // ───────── Acompañantes ─────────

  async addCompanion(
    checklistId: string,
    dto: SaveCompanionDto,
    user: ActiveUserInterface,
  ): Promise<ChecklistCompanion> {
    const checklist = await this.findOne(checklistId);
    await this.assertDriver(checklist.driverId, user);
    this.assertNoFirmado(checklist);

    if (!(await this.acompanantesPermitidos())) {
      throw new BadRequestException(
        'Tu empresa no permite declarar acompañantes en la planilla.',
      );
    }

    const companion = await this.companionsRepository.save(
      this.companionsRepository.create({
        ...dto,
        ...(await this.datosDelLegajo(dto)),
        checklistId,
      }),
    );

    // Declarar un acompañante implica que la planilla lo declara: si el chofer
    // cargó a alguien, la cabecera no puede seguir diciendo que viaja solo.
    if (!checklist.hasCompanion) {
      checklist.hasCompanion = true;
      await this.checklistsRepository.save(checklist);
    }
    return companion;
  }

  /**
   * Nombre y documento del acompañante cuando ya está en el sistema.
   *
   * Se copian del legajo en vez de aceptarse del cliente: es el mismo dato, y
   * dejar que se tipee de nuevo abre la puerta a que la planilla diga un
   * documento distinto del que figura en RRHH para la misma persona.
   */
  private async datosDelLegajo(dto: SaveCompanionDto) {
    if (!dto.employeeId) return {};

    const employee = await this.employeesRepository.findOne({
      where: { id: dto.employeeId },
      select: { id: true, firstName: true, lastName: true, documentId: true },
    });
    if (!employee) {
      throw new NotFoundException('No encontramos a esa persona en el legajo.');
    }

    return {
      fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      document: employee.documentId,
      idDocumentOnFile: await this.tieneDniCargado(employee.id),
    };
  }

  /**
   * Si la persona tiene la foto del DNI en el centro documental.
   *
   * El documento cuelga del perfil de chofer, no del legajo: es el único que
   * tiene documentación asociada. Alguien de RRHH sin perfil de chofer
   * simplemente no la tiene, y ahí sí hay que adjuntarla.
   */
  private async tieneDniCargado(employeeId: string): Promise<boolean> {
    const driver = await this.driversRepository.findOne({
      where: { employeeId },
      select: { id: true },
    });
    if (!driver) return false;

    return this.documentsRepository.exists({
      where: {
        ownerType: DocumentOwnerType.DRIVER,
        ownerId: driver.id,
        category: DocumentCategory.ID_CARD,
      },
    });
  }

  /**
   * Personas del sistema que se pueden declarar como acompañantes.
   *
   * Devuelve el nombre y si tiene el DNI cargado, nunca el número de documento:
   * el chofer necesita elegir a alguien, no leer los datos personales de sus
   * compañeros. El documento lo completa el servidor al guardar.
   */
  async companionCandidates(
    search: string | undefined,
    user: ActiveUserInterface,
  ): Promise<
    { id: string; fullName: string; position: string; hasIdDocument: boolean }[]
  > {
    const yo = await this.driversService.findByUserId(user.id).catch(() => null);

    const query = this.employeesRepository
      .createQueryBuilder('e')
      .where('e.employmentStatus = :activo', {
        activo: EmploymentStatus.ACTIVE,
      })
      .orderBy('e.lastName', 'ASC')
      .take(20);

    if (search?.trim()) {
      query.andWhere(
        "(CONCAT(e.firstName, ' ', e.lastName) LIKE :q OR e.documentId LIKE :q)",
        { q: `%${search.trim()}%` },
      );
    }
    // Nadie es acompañante de sí mismo.
    if (yo?.employeeId) {
      query.andWhere('e.id != :propio', { propio: yo.employeeId });
    }

    const employees = await query.getMany();
    return Promise.all(
      employees.map(async (e) => ({
        id: e.id,
        fullName: `${e.firstName} ${e.lastName}`.trim(),
        position: e.position,
        hasIdDocument: await this.tieneDniCargado(e.id),
      })),
    );
  }

  async removeCompanion(
    companionId: string,
    user: ActiveUserInterface,
  ): Promise<{ id: string }> {
    const companion = await this.companionsRepository.findOne({
      where: { id: companionId },
      relations: ['checklist'],
    });
    if (!companion) throw new NotFoundException('Acompañante no encontrado.');
    await this.assertDriver(companion.checklist.driverId, user);
    this.assertNoFirmado(companion.checklist);

    await this.companionsRepository.remove(companion);
    return { id: companionId };
  }

  // ───────── Firma ─────────

  async sign(
    id: string,
    dto: SignChecklistDto,
    user: ActiveUserInterface,
  ): Promise<Checklist> {
    const checklist = await this.findOne(id);
    await this.assertDriver(checklist.driverId, user);
    this.assertNoFirmado(checklist);

    this.assertDeclaracionesAceptadas(checklist.items);
    await this.assertFotosCompletas(checklist.items);
    await this.assertAcompanantesEnRegla(checklist);
    await this.assertUbicacion(checklist, dto);

    const fallados = checklist.items.filter(
      (i) => i.status === ChecklistItemStatus.FAIL,
    );

    if (dto.lat != null) checklist.lat = dto.lat;
    if (dto.lng != null) checklist.lng = dto.lng;
    checklist.signatureKey = dto.signatureKey;
    checklist.signedAt = new Date();
    checklist.result = await this.resolverResultado(checklist, fallados);
    checklist.updatedBy = user.id;

    const firmado = await this.checklistsRepository.save(checklist);
    await this.avisarSiNoConforme(firmado, fallados);
    return firmado;
  }

  /**
   * Qué pasa con la unidad después de la firma.
   *
   * Una falla crítica la deja afuera y no hay nada que validar. El resto de las
   * situaciones que la empresa marcó como delicadas —una falla cualquiera, un
   * punto que lo pide explícitamente, un acompañante declarado— no las resuelve
   * la firma: quedan esperando a Tráfico. Con todos los ajustes apagados —el
   * default— esto se comporta igual que antes: aprueba o rechaza y listo.
   */
  private async resolverResultado(
    checklist: Checklist,
    fallados: ChecklistItem[],
  ): Promise<ChecklistResult> {
    if (fallados.some((i) => i.isCritical)) return ChecklistResult.REJECTED;

    const porItem = fallados.some((i) => i.requiresValidationOnFail);
    const porFalla =
      fallados.length > 0 &&
      (await this.settings.getBoolean(
        SETTING.CHECKLIST_REQUIRE_VALIDATION_ON_FAIL,
      ));
    // Vale tanto la declaración de la cabecera como que haya gente cargada: si
    // el chofer cargó un acompañante, viaja acompañado más allá de cómo haya
    // quedado el sí/no.
    const porAcompanante =
      this.viajaAcompanado(checklist) &&
      (await this.settings.getBoolean(
        SETTING.CHECKLIST_REQUIRE_VALIDATION_WITH_COMPANION,
      ));

    return porItem || porFalla || porAcompanante
      ? ChecklistResult.PENDING_VALIDATION
      : ChecklistResult.APPROVED;
  }

  /**
   * Las declaraciones no se evalúan: se aceptan o no se firma.
   *
   * «Leído y soy consciente de la situación» no es el estado de una pieza del
   * camión; es la condición para seguir. Dejarla pasar sin marcar vaciaría de
   * sentido el bloque entero de la planilla.
   */
  private assertDeclaracionesAceptadas(items: ChecklistItem[]) {
    const sinAceptar = items
      .filter((i) => i.type === ChecklistItemType.ACK)
      .filter((i) => i.status !== ChecklistItemStatus.OK);

    if (sinAceptar.length) {
      throw new BadRequestException(
        `Tenés que aceptar: ${sinAceptar.map((i) => i.label).join(', ')}.`,
      );
    }
  }

  /**
   * Las fotos que la planilla exige tienen que estar antes de la firma.
   *
   * Son dos exigencias distintas: la foto de una falla —sin ella, la falla
   * queda sin respaldo y es justamente lo que después no se puede
   * reconstruir— y la foto que la empresa pide siempre, como el interior del
   * furgón en cada salida.
   */
  private async assertFotosCompletas(items: ChecklistItem[]) {
    const faltantes: string[] = [];
    const excedidos: string[] = [];

    /** Cuántas fotos exige este punto tal como quedó contestado. Cero, ninguna. */
    const minimoDe = (i: ChecklistItem) =>
      i.requiresPhoto ||
      (i.requiresPhotoOnFail && i.status === ChecklistItemStatus.FAIL)
        ? Math.max(i.minPhotos ?? 1, 1)
        : 0;

    // Se consulta S3 sólo por los puntos que tienen algo que verificar: exigen
    // fotos o tienen tope. Los demás no justifican una lectura por ítem.
    const aRevisar = items.filter(
      (i) => minimoDe(i) > 0 || i.maxPhotos != null,
    );

    for (const item of aRevisar) {
      const adjuntos = await this.attachmentsService.listByEntity(
        ENTIDAD_ITEM,
        item.id,
      );
      const minimo = minimoDe(item);

      if (adjuntos.length < minimo) {
        faltantes.push(
          minimo > 1
            ? `${item.label} (${adjuntos.length}/${minimo})`
            : item.label,
        );
      }
      if (item.maxPhotos != null && adjuntos.length > item.maxPhotos) {
        excedidos.push(`${item.label} (máximo ${item.maxPhotos})`);
      }
    }

    if (faltantes.length) {
      throw new BadRequestException(
        `Faltan fotos de: ${faltantes.join(', ')}. Sacalas antes de firmar.`,
      );
    }
    if (excedidos.length) {
      throw new BadRequestException(
        `Hay más fotos de las permitidas en: ${excedidos.join(', ')}.`,
      );
    }
  }

  /**
   * Lo que la empresa exige de un acompañante antes de dejar salir la unidad.
   *
   * Todo configurable y todo apagado por defecto: hay operaciones que ni
   * siquiera admiten acompañantes y otras donde el seguro es un trámite que se
   * resuelve por teléfono.
   */
  private async assertAcompanantesEnRegla(checklist: Checklist) {
    const companions = checklist.companions ?? [];

    if (!this.viajaAcompanado(checklist)) return;

    if (!(await this.acompanantesPermitidos())) {
      throw new BadRequestException(
        'Tu empresa no permite declarar acompañantes en la planilla.',
      );
    }
    if (checklist.hasCompanion && !companions.length) {
      throw new BadRequestException(
        'Declaraste que viajás con acompañante: cargá sus datos antes de firmar.',
      );
    }

    if (
      await this.settings.getBoolean(
        SETTING.CHECKLIST_REQUIRE_COMPANION_DOCUMENT,
      )
    ) {
      const sinDoc = companions.filter((c) => !c.document);
      if (sinDoc.length) {
        throw new BadRequestException(
          `Falta el documento de: ${sinDoc.map((c) => c.fullName).join(', ')}.`,
        );
      }
    }

    if (
      await this.settings.getBoolean(
        SETTING.CHECKLIST_REQUIRE_COMPANION_INSURANCE,
      )
    ) {
      const sinSeguro = companions.filter((c) => !c.insuranceRequested);
      if (sinSeguro.length) {
        throw new BadRequestException(
          `Es obligatorio pedir el seguro del acompañante a tu operador de tráfico. ` +
            `Falta el de: ${sinSeguro.map((c) => c.fullName).join(', ')}.`,
        );
      }
    }
  }

  private async assertUbicacion(checklist: Checklist, dto: SignChecklistDto) {
    if (
      !(await this.settings.getBoolean(SETTING.CHECKLIST_REQUIRE_GEOLOCATION))
    ) {
      return;
    }
    const lat = dto.lat ?? checklist.lat;
    const lng = dto.lng ?? checklist.lng;
    if (lat == null || lng == null) {
      throw new BadRequestException(
        'Tu empresa exige la ubicación al firmar la planilla. Activá el GPS y volvé a intentar.',
      );
    }
  }

  /**
   * El aviso que la planilla pide a gritos y el sistema no daba.
   *
   * Hasta ahora, una planilla rechazada no generaba nada: enterarse dependía de
   * que el chofer llamara. Sigue apagado por defecto —el default es lo que el
   * sistema hace hoy— pero deja de haber que construirlo cuando alguien lo
   * pide.
   */
  private async avisarSiNoConforme(
    checklist: Checklist,
    fallados: ChecklistItem[],
  ) {
    if (checklist.result === ChecklistResult.APPROVED) return;
    if (!(await this.settings.getBoolean(SETTING.CHECKLIST_ALERT_ON_REJECT))) {
      return;
    }
    await this.alertsService.createFromChecklist({
      id: checklist.id,
      tripId: checklist.tripId,
      result: checklist.result,
      motivos: fallados.map((i) => i.label),
      conAcompanante: this.viajaAcompanado(checklist),
    });
  }

  // ───────── Validación de Tráfico ─────────

  /**
   * Libera —o no— una unidad que quedó pendiente después de la firma.
   *
   * Es el paso que faltaba: la firma del chofer cierra su declaración, no la
   * aprueba. Queda registrado quién liberó, cuándo y con qué observación, que
   * es exactamente lo que una auditoría OEA pide y lo que un «me dijo que sí
   * por teléfono» no puede probar.
   */
  async validate(
    id: string,
    dto: ValidateChecklistDto,
    user: ActiveUserInterface,
  ): Promise<Checklist> {
    const checklist = await this.findOne(id);

    if (checklist.result !== ChecklistResult.PENDING_VALIDATION) {
      throw new BadRequestException(
        'Esta planilla no está esperando validación: ya quedó resuelta al firmarse.',
      );
    }
    if (!dto.approved && !dto.notes?.trim()) {
      throw new BadRequestException(
        'Para no liberar la unidad hay que dejar el motivo.',
      );
    }

    checklist.result = dto.approved
      ? ChecklistResult.APPROVED
      : ChecklistResult.REJECTED;
    checklist.validatedBy = user.id;
    checklist.validatedAt = new Date();
    checklist.validationNotes = dto.notes?.trim() || null;
    checklist.updatedBy = user.id;
    return this.checklistsRepository.save(checklist);
  }

  /** Las que esperan a Tráfico. Es la bandeja de trabajo del operador. */
  pendingValidation(): Promise<Checklist[]> {
    return this.checklistsRepository.find({
      where: { result: ChecklistResult.PENDING_VALIDATION },
      relations: ['items', 'companions'],
      order: { signedAt: 'ASC' },
    });
  }

  /**
   * Usado por trips para bloquear el inicio si no está aprobado.
   *
   * `PENDING_VALIDATION` no es aprobado, y ahí está el punto: la unidad no se
   * dirige al cliente hasta que alguien la libere.
   */
  async isApprovedForTrip(tripId: string): Promise<boolean> {
    const checklist = await this.checklistsRepository.findOne({
      where: { tripId },
    });
    return checklist?.result === ChecklistResult.APPROVED;
  }

  async findOne(id: string): Promise<Checklist> {
    const checklist = await this.checklistsRepository.findOne({
      where: { id },
      relations: ['items', 'companions'],
    });
    if (!checklist) throw new NotFoundException('Checklist no encontrado.');
    return checklist;
  }

  private acompanantesPermitidos(): Promise<boolean> {
    return this.settings.getBoolean(SETTING.CHECKLIST_ALLOW_COMPANION);
  }

  private viajaAcompanado(checklist: Checklist): boolean {
    return !!checklist.hasCompanion || !!checklist.companions?.length;
  }

  /**
   * Un checklist firmado no se modifica, ni por el chofer ni por la oficina, y
   * tampoco se vuelve a firmar.
   *
   * Es el registro que respalda que la unidad salió en condiciones: si los
   * ítems se pueden cambiar después de la firma, la firma no prueba nada y el
   * papel no sirve ante la CNRT ni ante un siniestro. Por eso acá no hay
   * reapertura: el error se corrige con un checklist nuevo del viaje, no
   * editando el viejo. La validación de Tráfico es la única excepción, y no
   * toca lo que el chofer declaró: sólo resuelve si la unidad sale.
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
      throw new ForbiddenException(
        'Este checklist no corresponde a su perfil.',
      );
    }
  }
}
