import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';
import { runAsSystem } from 'src/common/tenant/tenant-context';
import { BillingNotificationsService } from './billing-notifications.service';

/**
 * Días de gracia en `DEFAULTER` antes de pasar a solo lectura (decisión **D9**).
 *
 * Sumados a los 10 días de plazo de pago de `BillingService`, un cliente tiene
 * **20 días** desde que se emite el período hasta que se le corta la escritura.
 * El valor sugerido en el plan todavía no lo confirmó el dueño del producto: es
 * el único número de este archivo que se espera que cambie, por eso está acá y
 * no repartido en las consultas.
 */
export const DIAS_DE_GRACIA = 10;

/** Empresa con deuda vencida, ya resuelta a lo que hace falta para decidir. */
interface Morosa {
  id: string;
  name: string;
  status: CompanyStatus;
  defaultedAt: Date | null;
  deuda: number;
  vencidoDesde: Date;
}

/**
 * Ciclo de mora: qué pasa cuando un período se vence sin pagarse.
 *
 *   `ACTIVE` --vence--> `DEFAULTER` --10 días--> `BLOCKED` --paga--> `ACTIVE`
 *
 * Está separado de `BillingService` —que emite— porque son dos decisiones
 * distintas: cuánto se le cobra a alguien y qué se le corta si no paga. La
 * segunda es la que puede dejar sin sistema a un cliente que sí pagó, y merece
 * poder leerse sola.
 *
 * **Nada de esto bloquea del todo.** `BLOCKED` es solo lectura (decisión D6):
 * el cliente sigue viendo sus datos y sigue pudiendo pagar. Bloquear el acceso
 * completo destruye la relación comercial justo cuando todavía se puede cobrar.
 */
@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly avisos: BillingNotificationsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Empresas con al menos un período vencido e impago.
   *
   * Una sola consulta agregada para todas: recorrer empresa por empresa
   * haciendo un `SELECT` de sus períodos es el tipo de cron que funciona con
   * diez clientes y se cae con mil.
   *
   * La empresa plataforma queda afuera: CamioNex no se cobra a sí misma.
   */
  private async morosas(fecha: Date): Promise<Morosa[]> {
    const filas: {
      id: string;
      name: string;
      status: CompanyStatus;
      defaultedAt: Date | null;
      deuda: string;
      vencidoDesde: string;
    }[] = await this.companiesRepository.query(
      'SELECT c.`id` AS id, c.`name` AS name, c.`status` AS status, ' +
        'c.`defaultedAt` AS defaultedAt, SUM(s.`amount`) AS deuda, ' +
        'MIN(s.`expiration`) AS vencidoDesde ' +
        'FROM `companies` c ' +
        'JOIN `subscriptions` s ON s.`companyId` = c.`id` ' +
        'WHERE c.`isPlatform` = 0 AND c.`deletedAt` IS NULL ' +
        "AND s.`isPaid` = 0 AND s.`deletedAt` IS NULL AND s.`status` <> 'void' " +
        'AND s.`expiration` < ? ' +
        'GROUP BY c.`id`, c.`name`, c.`status`, c.`defaultedAt`',
      [this.soloFecha(fecha)],
    );

    return filas.map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      defaultedAt: f.defaultedAt ? new Date(f.defaultedAt) : null,
      deuda: Number(f.deuda) || 0,
      vencidoDesde: new Date(f.vencidoDesde),
    }));
  }

  /** Deuda vencida de una empresa. 0 si está al día. */
  async deudaVencida(companyId: string, fecha = new Date()): Promise<number> {
    const [fila]: { deuda: string | null }[] =
      await this.companiesRepository.query(
        'SELECT SUM(`amount`) AS deuda FROM `subscriptions` ' +
          "WHERE `companyId` = ? AND `isPaid` = 0 AND `deletedAt` IS NULL AND `status` <> 'void' " +
          'AND `expiration` < ?',
        [companyId, this.soloFecha(fecha)],
      );

    return Number(fila?.deuda ?? 0) || 0;
  }

  /** Todo lo impago de una empresa, esté vencido o no. */
  async deudaTotal(companyId: string): Promise<number> {
    const [fila]: { deuda: string | null }[] =
      await this.companiesRepository.query(
        'SELECT SUM(`amount`) AS deuda FROM `subscriptions` ' +
          "WHERE `companyId` = ? AND `isPaid` = 0 AND `deletedAt` IS NULL AND `status` <> 'void'",
        [companyId],
      );

    return Number(fila?.deuda ?? 0) || 0;
  }

  /**
   * `ACTIVE` → `DEFAULTER` para las que tienen un período vencido.
   *
   * Idempotente: la segunda corrida del día no encuentra ninguna `ACTIVE` con
   * deuda vencida —ya pasaron todas a `DEFAULTER`— así que no reescribe
   * `defaultedAt` ni vuelve a avisar. Eso importa: si el reloj de la gracia se
   * reiniciara en cada corrida, nadie llegaría nunca al bloqueo.
   */
  async marcarMorosas(fecha = new Date()): Promise<number> {
    return runAsSystem(async () => {
      const candidatas = (await this.morosas(fecha)).filter(
        (m) => m.status === CompanyStatus.ACTIVE,
      );

      for (const m of candidatas) {
        await this.companiesRepository.update(m.id, {
          status: CompanyStatus.DEFAULTER,
          defaultedAt: fecha,
        });

        const bloqueaEl = this.sumarDias(fecha, DIAS_DE_GRACIA);
        await this.avisos.cuentaEnMora(m.id, {
          amount: m.deuda,
          diasDeGracia: DIAS_DE_GRACIA,
          bloqueaEl,
        });

        await this.auditLog.registrar(null, {
          action: AUDIT.BILLING_COMPANY_DEFAULTED,
          companyId: m.id,
          entityType: 'company',
          entityId: m.id,
          metadata: {
            deuda: m.deuda,
            vencidoDesde: m.vencidoDesde,
            bloqueaEl,
          },
        });

        this.logger.warn(
          `Mora: ${m.name} (${m.id}) debe ${m.deuda} desde ${this.soloFecha(m.vencidoDesde)}.`,
        );
      }

      return candidatas.length;
    });
  }

  /**
   * `DEFAULTER` → `BLOCKED` pasados los días de gracia.
   *
   * El reloj se cuenta desde `defaultedAt` y no desde el vencimiento del
   * período: si una empresa en mora recibe la factura del mes siguiente, el
   * vencimiento más viejo sigue siendo el mismo, pero mirar "la factura" en
   * lugar de "la empresa" haría que el momento del bloqueo dependiera de cuál
   * de las dos se consultara.
   */
  async bloquearMorosas(fecha = new Date()): Promise<number> {
    return runAsSystem(async () => {
      // Se comparan fechas sin hora: "10 días de gracia" es lo que entiende
      // una persona, no 240 horas exactas desde que corrió el cron. Con la hora
      // adentro, que el bloqueo cayera hoy o mañana dependería de si el cron de
      // hoy arrancó unos segundos antes que el de hace diez días.
      const limite = this.soloFecha(this.sumarDias(fecha, -DIAS_DE_GRACIA));

      const candidatas = (await this.morosas(fecha)).filter(
        (m) =>
          m.status === CompanyStatus.DEFAULTER &&
          // Sin `defaultedAt` no se puede saber cuándo empezó la gracia; se usa
          // el vencimiento como piso en vez de bloquear a ciegas.
          this.soloFecha(m.defaultedAt ?? m.vencidoDesde) <= limite,
      );

      for (const m of candidatas) {
        await this.companiesRepository.update(m.id, {
          status: CompanyStatus.BLOCKED,
        });

        await this.avisos.cuentaBloqueada(m.id, { amount: m.deuda });

        await this.auditLog.registrar(null, {
          action: AUDIT.BILLING_COMPANY_BLOCKED,
          companyId: m.id,
          entityType: 'company',
          entityId: m.id,
          metadata: { deuda: m.deuda, enMoraDesde: m.defaultedAt },
        });

        this.logger.warn(
          `Bloqueo por mora: ${m.name} (${m.id}) pasa a solo lectura.`,
        );
      }

      return candidatas.length;
    });
  }

  /**
   * Aviso interno de los bloqueos de mañana (mitigación de **R9.3**).
   *
   * Un bloqueo automático sobre alguien que sí pagó —una transferencia sin
   * conciliar, un webhook que nunca llegó— se arregla en un minuto si se ve
   * venir, y cuesta un cliente si se entera el cliente primero. Por eso el
   * bloqueo nunca es silencioso: siempre hay una persona avisada un día antes.
   */
  async avisarBloqueosInminentes(fecha = new Date()): Promise<number> {
    return runAsSystem(async () => {
      // Las que cruzan el límite mañana: hoy todavía no lo alcanzaron.
      const limiteHoy = this.soloFecha(this.sumarDias(fecha, -DIAS_DE_GRACIA));
      const limiteManana = this.soloFecha(
        this.sumarDias(fecha, -DIAS_DE_GRACIA + 1),
      );

      const proximas = (await this.morosas(fecha))
        .filter((m) => m.status === CompanyStatus.DEFAULTER)
        .filter((m) => {
          const desde = this.soloFecha(m.defaultedAt ?? m.vencidoDesde);
          return desde > limiteHoy && desde <= limiteManana;
        });

      if (!proximas.length) return 0;

      await this.avisos.bloqueoInminente(
        proximas.map((m) => ({
          name: m.name,
          amount: m.deuda,
          bloqueaEl: this.sumarDias(fecha, 1),
        })),
      );

      return proximas.length;
    });
  }

  /**
   * Devuelve la cuenta a `ACTIVE` cuando ya no queda nada impago.
   *
   * Se llama al acreditar un pago —venga de Mercado Pago o de una conciliación
   * a mano—, no desde un cron: el criterio de aceptación de la fase es que una
   * empresa bloqueada **se desbloquee sola** al pagar, y esperar a las 5 de la
   * mañana siguiente no es sola, es tarde.
   *
   * Devuelve `false` si no había nada que regularizar.
   */
  async regularizar(companyId: string): Promise<boolean> {
    return runAsSystem(async () => {
      const company = await this.companiesRepository.findOne({
        where: { id: companyId },
      });

      if (
        !company ||
        ![CompanyStatus.DEFAULTER, CompanyStatus.BLOCKED].includes(
          company.status,
        )
      ) {
        return false;
      }

      // Mientras quede una sola factura impaga, la cuenta sigue en mora: pagar
      // el último período no borra los anteriores.
      if ((await this.deudaTotal(companyId)) > 0) return false;

      await this.companiesRepository.update(companyId, {
        status: CompanyStatus.ACTIVE,
        defaultedAt: null,
      });

      await this.auditLog.registrar(null, {
        action: AUDIT.BILLING_COMPANY_REGULARIZED,
        companyId,
        entityType: 'company',
        entityId: companyId,
        metadata: { estadoAnterior: company.status },
      });

      this.logger.log(
        `Cuenta regularizada: ${company.name} (${companyId}) vuelve a activa.`,
      );
      return true;
    });
  }

  /**
   * Aviso de vencimiento próximo, a los días indicados de la fecha límite.
   *
   * Se avisa **el día exacto** y no "faltan N o menos" para no mandar el mismo
   * correo todas las mañanas: el cliente deja de leerlos y el aviso que
   * importa, el del bloqueo, se pierde entre los repetidos.
   */
  async avisarVencimientosProximos(
    fecha = new Date(),
    dias = 3,
  ): Promise<number> {
    return runAsSystem(async () => {
      const objetivo = this.soloFecha(this.sumarDias(fecha, dias));

      const filas: {
        companyId: string;
        deuda: string;
        expiration: string;
      }[] = await this.companiesRepository.query(
        'SELECT s.`companyId` AS companyId, SUM(s.`amount`) AS deuda, ' +
          's.`expiration` AS expiration ' +
          'FROM `subscriptions` s JOIN `companies` c ON c.`id` = s.`companyId` ' +
          'WHERE c.`isPlatform` = 0 AND c.`deletedAt` IS NULL ' +
          "AND s.`isPaid` = 0 AND s.`deletedAt` IS NULL AND s.`status` <> 'void' " +
          'AND s.`expiration` = ? ' +
          'GROUP BY s.`companyId`, s.`expiration`',
        [objetivo],
      );

      for (const f of filas) {
        await this.avisos.vencimientoProximo(f.companyId, {
          amount: Number(f.deuda) || 0,
          expiration: new Date(f.expiration),
          dias,
        });
      }

      return filas.length;
    });
  }

  /**
   * Avisos de fin de prueba, a 7, 3 y 1 día.
   *
   * Vive acá y no en `CompanyStatusCron` —que es quien hace la transición a
   * solo lectura— porque es el mismo problema que la mora: una cuenta que está
   * por dejar de funcionar y una persona que todavía puede evitarlo. Que los
   * cinco avisos del ciclo comercial se escriban en el mismo lugar es lo que
   * permite ver de un vistazo qué recibe un cliente y en qué orden.
   *
   * Se avisa **el día exacto** —no "faltan 7 o menos"— para que sean tres
   * correos y no veintiuno.
   */
  async avisarTrialsPorVencer(
    fecha = new Date(),
    hitos = [7, 3, 1],
  ): Promise<number> {
    return runAsSystem(async () => {
      let avisados = 0;

      for (const dias of hitos) {
        const objetivo = this.soloFecha(this.sumarDias(fecha, dias));

        const filas: { id: string; trialEndsAt: string }[] =
          await this.companiesRepository.query(
            'SELECT `id`, `trialEndsAt` FROM `companies` ' +
              "WHERE `status` = 'trial' AND `isPlatform` = 0 " +
              'AND `deletedAt` IS NULL AND DATE(`trialEndsAt`) = ?',
            [objetivo],
          );

        for (const f of filas) {
          await this.avisos.trialPorVencer(f.id, {
            dias,
            terminaEl: new Date(f.trialEndsAt),
          });
          avisados++;
        }
      }

      return avisados;
    });
  }

  // ── Utilidades ──────────────────────────────────────────────────────────

  private sumarDias(fecha: Date, dias: number): Date {
    const r = new Date(fecha);
    r.setDate(r.getDate() + dias);
    return r;
  }

  /** `YYYY-MM-DD`, para comparar contra columnas `date` sin zona horaria. */
  private soloFecha(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
}
