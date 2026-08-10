import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertRuleConfig } from 'src/alerts/entities/alert-rule-config.entity';
import { MaintenancePlan } from 'src/maintenance/entities/maintenance-plan.entity';
import { Company } from 'src/companies/entities/company.entity';
import { PlanContextService } from './plan-context.service';
import { PlanLimits } from './entities/plan.entity';
import {
  StorageAddon,
  TECHO_STORAGE_ADDON,
} from 'src/common/enums/storageAddon.enum';
import { MaintenancePlanStatus } from 'src/common/enums/maintenance.enum';

/** Límites de conteo que se validan antes de crear un recurso. */
export type LimiteContable = 'alertRules' | 'maintenancePlans';

const GB = 1024 * 1024 * 1024;

/**
 * Aplica los límites cuantitativos del plan (MODELO-COMERCIAL §4.1).
 *
 * A diferencia del gating por feature —que es un sí/no y se resuelve en un
 * guard—, estos límites necesitan mirar el estado actual de la empresa, así que
 * se consultan desde el servicio, en el momento de crear el recurso.
 *
 * Todos los mensajes de error nombran el límite y sugieren la salida comercial:
 * un tope que frena sin explicar por qué genera un ticket de soporte, no una
 * venta.
 */
@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name);

  constructor(
    private readonly planContext: PlanContextService,
    @InjectRepository(AlertRuleConfig)
    private readonly rulesRepository: Repository<AlertRuleConfig>,
    @InjectRepository(MaintenancePlan)
    private readonly maintenancePlansRepository: Repository<MaintenancePlan>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
  ) {}

  private async limites(companyId: string): Promise<PlanLimits | null> {
    return (await this.planContext.obtener(companyId))?.limits ?? null;
  }

  /**
   * Verifica que quede cupo antes de crear. `null` en el límite = ilimitado.
   *
   * Cuenta lo que hay HOY: si un downgrade dejó a la empresa por encima del
   * tope, no se borra nada (nunca se borra), pero tampoco puede sumar más.
   */
  async assertCanCreate(
    companyId: string,
    limite: LimiteContable,
  ): Promise<void> {
    const limites = await this.limites(companyId);
    if (!limites) return;

    const tope = limites[limite];
    if (tope === null || tope === undefined) return; // ilimitado

    const { actual, etiqueta } = await this.contar(companyId, limite);

    if (actual >= tope) {
      throw new BadRequestException({
        message:
          `Tu plan permite ${tope} ${etiqueta}. ` +
          'Actualizá el plan para agregar más.',
        error: 'PLAN_LIMIT_REACHED',
        limit: limite,
        max: tope,
        current: actual,
      });
    }
  }

  private async contar(
    companyId: string,
    limite: LimiteContable,
  ): Promise<{ actual: number; etiqueta: string }> {
    if (limite === 'alertRules') {
      // Sólo las activas ocupan cupo: una regla apagada no cuesta nada.
      const actual = await this.rulesRepository.count({
        where: { companyId, enabled: true },
      });
      return { actual, etiqueta: 'reglas de alerta activas' };
    }

    const actual = await this.maintenancePlansRepository.count({
      where: { companyId },
    });
    return { actual, etiqueta: 'planes de mantenimiento' };
  }

  /**
   * Verifica que el rol esté habilitado para el plan.
   *
   * Los planes chicos no incluyen todos los roles: Control no tiene taller,
   * RRHH ni auditoría (MODELO-COMERCIAL §4.1).
   */
  async assertRolPermitido(companyId: string, rol: string): Promise<void> {
    const limites = await this.limites(companyId);
    const roles = limites?.roles;
    if (!roles || roles.length === 0) return; // sin restricción declarada

    if (!roles.includes(rol)) {
      throw new BadRequestException({
        message:
          `El rol "${rol}" no está disponible en tu plan. ` +
          'Actualizá el plan para habilitarlo.',
        error: 'ROLE_NOT_IN_PLAN',
        role: rol,
        allowedRoles: roles,
      });
    }
  }

  /**
   * Ajusta el excedente cuando una empresa baja de plan (riesgo R4.3).
   *
   * Si el plan nuevo permite 3 reglas y la empresa tenía 8 activas, sin esto
   * quedaría por encima del tope de forma indefinida: no podría crear más, pero
   * seguiría usando 8. El excedente se **desactiva por antigüedad** —se apagan
   * las más nuevas y se conservan las más viejas, que son las que el cliente
   * viene usando— y **nunca se borra nada**: si vuelve a subir de plan, alcanza
   * con reactivarlas.
   *
   * Devuelve qué se desactivó, para poder notificárselo al cliente en lugar de
   * que lo descubra solo.
   */
  async ajustarExcedentePorDowngrade(
    companyId: string,
  ): Promise<{ alertRules: string[]; maintenancePlans: string[] }> {
    const limites = await this.limites(companyId);
    const desactivado = { alertRules: [] as string[], maintenancePlans: [] as string[] };
    if (!limites) return desactivado;

    // Reglas de alerta: se apagan, no se borran.
    const topeReglas = limites.alertRules;
    if (topeReglas !== null && topeReglas !== undefined) {
      const activas = await this.rulesRepository.find({
        where: { companyId, enabled: true },
        order: { createdAt: 'ASC' },
      });
      const sobran = activas.slice(topeReglas);
      for (const regla of sobran) {
        regla.enabled = false;
        await this.rulesRepository.save(regla);
        desactivado.alertRules.push(regla.key);
      }
    }

    // Planes de mantenimiento: se pausan pasándolos a inactivos.
    const topePlanes = limites.maintenancePlans;
    if (topePlanes !== null && topePlanes !== undefined) {
      const planes = await this.maintenancePlansRepository.find({
        where: { companyId, status: MaintenancePlanStatus.ACTIVE },
        order: { createdAt: 'ASC' },
      });
      const sobran = planes.slice(topePlanes);
      for (const plan of sobran) {
        plan.status = MaintenancePlanStatus.PAUSED;
        await this.maintenancePlansRepository.save(plan);
        desactivado.maintenancePlans.push(plan.name);
      }
    }

    if (desactivado.alertRules.length || desactivado.maintenancePlans.length) {
      this.logger.warn(
        `Downgrade de ${companyId}: se desactivaron ` +
          `${desactivado.alertRules.length} regla(s) de alerta y ` +
          `${desactivado.maintenancePlans.length} plan(es) de mantenimiento ` +
          'por exceder el tope del plan nuevo. Nada se borró.',
      );
    }

    return desactivado;
  }

  // ── Almacenamiento ────────────────────────────────────────────────────────

  /**
   * Verifica que entre un archivo nuevo antes de subirlo a S3.
   *
   * Se chequea ANTES de subir: si se validara después, el archivo ya estaría
   * ocupando lugar (y costando) aunque la operación termine rechazada.
   *
   * Éste es el límite que protege el margen: el almacenamiento es el costo
   * variable oculto del negocio (MODELO-COMERCIAL §7.6).
   */
  async assertHayEspacio(companyId: string, bytes: number): Promise<void> {
    const estado = await this.estadoStorage(companyId);
    if (estado.maxGb === null) return; // ilimitado

    if (estado.usedBytes + bytes > estado.maxGb * GB) {
      const usadoGb = (estado.usedBytes / GB).toFixed(2);

      // El mensaje ofrece primero el add-on y sólo después el cambio de plan:
      // quedarse sin espacio no es motivo para venderle funcionalidad que no
      // pidió, es un costo de infraestructura que se cubre con capacidad.
      const siguiente = estado.siguienteEscalonGb;
      throw new PayloadTooLargeException({
        message:
          `Alcanzaste el límite de almacenamiento (${estado.maxGb} GB, ` +
          `${usadoGb} GB en uso). ` +
          (siguiente
            ? `Podés ampliarlo a ${siguiente} GB sin cambiar de plan.`
            : 'Contactanos para ampliar la capacidad.'),
        error: 'STORAGE_LIMIT_REACHED',
        maxGb: estado.maxGb,
        usedBytes: estado.usedBytes,
        nextTierGb: siguiente,
      });
    }
  }

  /**
   * Capacidad y consumo actuales de la empresa.
   *
   * El tope efectivo es el MAYOR entre lo que incluye el plan y el techo del
   * add-on contratado: así, contratar el escalón de 10 GB en un plan que ya trae
   * 50 no le baja la capacidad a nadie.
   */
  async estadoStorage(companyId: string): Promise<{
    usedBytes: number;
    maxGb: number | null;
    planGb: number | null;
    addon: StorageAddon;
    siguienteEscalonGb: number | null;
  }> {
    const limites = await this.limites(companyId);
    const planGb = limites?.storageGb ?? null;

    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
      select: { id: true, storageBytesUsed: true, storageAddon: true },
    });

    const addon = company?.storageAddon ?? StorageAddon.NONE;
    const techoAddon = TECHO_STORAGE_ADDON[addon];

    // `null` en el plan significa ilimitado y gana sobre cualquier escalón.
    const maxGb =
      planGb === null ? null : Math.max(planGb, techoAddon ?? 0);

    return {
      usedBytes: Number(company?.storageBytesUsed ?? 0),
      maxGb,
      planGb,
      addon,
      siguienteEscalonGb: this.siguienteEscalon(maxGb),
    };
  }

  /** Próximo techo de capacidad que se le puede ofrecer, o `null` si no hay. */
  private siguienteEscalon(maxGbActual: number | null): number | null {
    if (maxGbActual === null) return null;
    const techos = Object.values(TECHO_STORAGE_ADDON)
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);
    return techos.find((t) => t > maxGbActual) ?? null;
  }

  /**
   * Ajusta el acumulado de la empresa. `delta` negativo al borrar.
   *
   * Se hace con una sentencia atómica (`storageBytesUsed + delta`) en lugar de
   * leer-modificar-escribir: dos subidas simultáneas se pisarían.
   *
   * `GREATEST(..., 0)` evita que un desvío deje el contador en negativo; el cron
   * de reconciliación corrige la deriva real.
   */
  async ajustarStorage(companyId: string, delta: number): Promise<void> {
    if (!delta) return;
    await this.companiesRepository.query(
      'UPDATE `companies` SET `storageBytesUsed` = GREATEST(CAST(`storageBytesUsed` AS SIGNED) + ?, 0) WHERE `id` = ?',
      [delta, companyId],
    );
  }
}
