import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Plan, PlanLimits } from './entities/plan.entity';

/** Lo que necesita saber el gating sobre una empresa. */
export interface ContextoDePlan {
  planId: string;
  planCode: string;
  planName: string;
  features: string[];
  limits: PlanLimits | null;
}

interface Entrada {
  valor: ContextoDePlan | null;
  expiraEn: number;
}

/** Vida de la caché. Corta a propósito: ver el comentario de la clase. */
const TTL_MS = 60_000;

/**
 * Resuelve el plan vigente de una empresa.
 *
 * **El plan no viaja en el JWT.** El token dura un día: si el plan fuera parte
 * del payload, una empresa que sube de plan seguiría bloqueada hasta el próximo
 * login, y una que se da de baja seguiría teniendo acceso. Se consulta contra la
 * base, que es la única fuente de verdad.
 *
 * Para que eso no signifique un `SELECT` con join en cada request a un endpoint
 * gateado, hay una caché en memoria de 60 segundos. El costo de esa ventana es
 * acotado y conocido: un cambio de plan tarda a lo sumo un minuto en aplicarse,
 * y `invalidar()` lo hace inmediato cuando el cambio sale de la propia
 * aplicación.
 *
 * La caché es por proceso. Con varias instancias, cada una tiene la suya: no hay
 * problema de coherencia porque nadie escribe en ella, sólo cachea lecturas.
 */
@Injectable()
export class PlanContextService {
  private readonly cache = new Map<string, Entrada>();

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
  ) {}

  async obtener(companyId: string): Promise<ContextoDePlan | null> {
    const ahora = Date.now();
    const cacheado = this.cache.get(companyId);
    if (cacheado && cacheado.expiraEn > ahora) return cacheado.valor;

    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
      select: { id: true, planId: true },
    });

    let valor: ContextoDePlan | null = null;

    if (company?.planId) {
      const plan = await this.plansRepository.findOne({
        where: { id: company.planId },
      });
      if (plan) {
        // Las features efectivas son `plan ∪ add-ons contratados`. Es lo que
        // permite que API + Webhooks sea add-on en Gestión e incluido en
        // Corporate sin que el gating tenga que saber de esa distinción.
        const deAddons = await this.featuresDeAddons(companyId);

        valor = {
          planId: plan.id,
          planCode: plan.code,
          planName: plan.name,
          features: [...new Set([...(plan.features ?? []), ...deAddons])],
          limits: plan.limits ?? null,
        };
      }
    }

    this.cache.set(companyId, { valor, expiraEn: ahora + TTL_MS });
    return valor;
  }

  /**
   * Features que aportan los add-ons vigentes de la empresa.
   *
   * Se resuelve con SQL crudo y no por repositorio a propósito: este servicio lo
   * consume el `FeatureGuard`, que es global, y no puede depender del módulo de
   * facturación sin crear un ciclo de dependencias entre planes y billing.
   */
  private async featuresDeAddons(companyId: string): Promise<string[]> {
    const filas: { features: string | null }[] =
      await this.plansRepository.query(
        'SELECT a.`features` AS features ' +
          'FROM `company_addons` ca ' +
          'JOIN `addons` a ON a.`id` = ca.`addonId` ' +
          'WHERE ca.`companyId` = ? ' +
          '  AND ca.`deletedAt` IS NULL ' +
          '  AND ca.`startedAt` <= CURDATE() ' +
          '  AND (ca.`endedAt` IS NULL OR ca.`endedAt` > CURDATE())',
        [companyId],
      );

    const features: string[] = [];
    for (const f of filas) {
      if (!f.features) continue;
      try {
        features.push(...(JSON.parse(f.features) as string[]));
      } catch {
        // Catálogo corrupto: se ignora esa fila en vez de tumbar el guard.
      }
    }
    return features;
  }

  async tieneFeature(companyId: string, feature: string): Promise<boolean> {
    const contexto = await this.obtener(companyId);
    return contexto?.features.includes(feature) ?? false;
  }

  /** Fuerza la relectura. Se llama al cambiar el plan de una empresa. */
  invalidar(companyId: string): void {
    this.cache.delete(companyId);
  }

  invalidarTodo(): void {
    this.cache.clear();
  }
}
