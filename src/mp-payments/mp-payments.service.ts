import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MercadoPagoConfig,
  Payment as MpPaymentClient,
  PreApproval,
  Preference,
} from 'mercadopago';
import { Company } from 'src/companies/entities/company.entity';
import { Subscription } from 'src/billing/entities/subscription.entity';
import { Payment } from 'src/billing/entities/payment.entity';
import { BillingService } from 'src/billing/billing.service';
import { DunningService } from 'src/billing/dunning.service';
import { BillingNotificationsService } from 'src/billing/billing-notifications.service';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';
import {
  PaymentMethod,
  PaymentStatusMp,
  PreapprovalStatus,
  SubscriptionStatus,
} from 'src/common/enums/billing.enum';
import { runAsCompany, runAsSystem } from 'src/common/tenant/tenant-context';

/** Resultado de procesar un aviso de MP. */
export interface ResultadoConfirmacion {
  /** El aviso ya se había procesado: no se tocó nada. */
  duplicado: boolean;
  status?: PaymentStatusMp;
  companyId?: string | null;
  subscriptionId?: string | null;
  acreditado?: boolean;
}

/** Código de MySQL para violación de índice único. */
const ER_DUP_ENTRY = 'ER_DUP_ENTRY';

/**
 * Cobro por Mercado Pago.
 *
 * **La diferencia con Aturna es toda la integración.** Aturna usa MP
 * Marketplace: cada institución cobra a sus pacientes con su propia cuenta, y
 * por eso necesita OAuth, un token por institución, refresco de tokens y
 * resolver con qué credencial consultar cada pago. Acá pasa lo contrario:
 * **FleetLog le cobra a la empresa**, siempre con la misma cuenta. No hay
 * vinculación de cuentas, no hay tokens por empresa y no hay `mp-auth/`.
 *
 * Dos formas de cobrar:
 *
 *  - **Link de pago** (`Preference`) para saldar un período puntual.
 *  - **Débito automático** (`PreApproval`) para que el cobro deje de requerir
 *    que alguien se acuerde de pagar, que es el objetivo de la fase.
 */
@Injectable()
export class MpPaymentsService {
  private readonly logger = new Logger(MpPaymentsService.name);

  private clientes: {
    preference: Preference;
    preapproval: PreApproval;
    payment: MpPaymentClient;
  } | null = null;

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly billing: BillingService,
    private readonly dunning: DunningService,
    private readonly avisos: BillingNotificationsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Clientes de MP, creados al primer uso.
   *
   * **No se crean en el constructor a propósito.** Si faltara el token, un
   * constructor que lanza deja la aplicación entera sin arrancar: una
   * instalación sin cobro configurado —desarrollo, tests, un cliente que
   * factura por transferencia— no puede quedar sin sistema por eso. Así, lo
   * único que falla es intentar cobrar, y con un mensaje que dice qué falta.
   */
  private mp() {
    if (this.clientes) return this.clientes;

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'El cobro por Mercado Pago no está configurado (falta MP_ACCESS_TOKEN).',
      );
    }

    const config = new MercadoPagoConfig({ accessToken });
    this.clientes = {
      preference: new Preference(config),
      preapproval: new PreApproval(config),
      payment: new MpPaymentClient(config),
    };
    return this.clientes;
  }

  /** ¿Está configurado el cobro? Lo consulta el front para mostrar el botón. */
  get disponible(): boolean {
    return !!process.env.MP_ACCESS_TOKEN;
  }

  /**
   * URL a la que MP manda los avisos.
   *
   * Tolera las dos formas de `BACK_URL` que conviven en estos proyectos: con el
   * prefijo de la API incluido (`https://host/api/v1/`, que es como está en
   * Aturna) y sin él. **No es prolijidad**: si se copia el valor de un proyecto
   * al otro, la forma equivocada produce `/api/v1/api/v1/webhooks/mercadopago`,
   * MP postea a un 404 y los pagos dejan de acreditarse **sin ningún error
   * visible** —el cobro sale bien, el cliente paga, y la factura queda impaga
   * camino al bloqueo—. Es el peor modo de fallar posible, así que se acepta
   * cualquiera de las dos en vez de confiar en que nadie se confunda.
   */
  private get urlDeAvisos(): string {
    const base = (process.env.BACK_URL ?? '').replace(/\/+$/, '');
    const conPrefijo = base.endsWith('/api/v1') ? base : `${base}/api/v1`;
    return `${conPrefijo}/webhooks/mercadopago`;
  }

  private get urlDeRetorno(): string {
    return `${process.env.FRONT_URL}/estado-plan`;
  }

  // ─────────────────────────── Cobro puntual ────────────────────────────────

  /**
   * Link de pago de un período.
   *
   * `external_reference` es el id del período: es lo que después permite
   * imputar el pago sin adivinar. MP lo devuelve tal cual en el aviso.
   */
  async linkDePago(companyId: string, subscriptionId: string) {
    const sub = await runAsCompany(companyId, () =>
      this.subscriptionsRepository.findOne({
        where: { id: subscriptionId, companyId },
      }),
    );

    if (!sub) throw new NotFoundException('Período no encontrado.');
    if (sub.isPaid) throw new BadRequestException('El período ya está pagado.');
    if (sub.status === SubscriptionStatus.VOID) {
      throw new BadRequestException('El período está anulado.');
    }

    const importe = Number(sub.amount);
    if (!(importe > 0)) {
      throw new BadRequestException('El período no tiene importe a cobrar.');
    }

    const respuesta = await this.mp().preference.create({
      body: {
        items: [
          {
            id: sub.id,
            title: `FleetLog — período ${this.fecha(sub.periodStart)} a ${this.fecha(sub.periodEnd)}`,
            quantity: 1,
            unit_price: importe,
            currency_id: 'ARS',
          },
        ],
        back_urls: {
          success: `${this.urlDeRetorno}?pago=exitoso`,
          failure: `${this.urlDeRetorno}?pago=fallido`,
          pending: `${this.urlDeRetorno}?pago=pendiente`,
        },
        notification_url: this.urlDeAvisos,
        auto_return: 'approved',
        external_reference: sub.id,
        // Sin esto MP admite medios que quedan "en proceso" durante días, y el
        // cliente cree que pagó mientras la cuenta sigue marchando a bloqueo.
        binary_mode: true,
      },
    });

    return {
      subscriptionId: sub.id,
      amount: importe,
      url: respuesta.init_point,
      sandboxUrl: respuesta.sandbox_init_point,
    };
  }

  // ────────────────────────── Débito automático ─────────────────────────────

  /** Estado del cobro automático de una empresa, para la pantalla del cliente. */
  async estado(companyId: string) {
    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: companyId } }),
    );
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    return {
      disponible: this.disponible,
      preapprovalId: company.mpPreapprovalId,
      status: company.mpPreapprovalStatus,
      payerEmail: company.mpPayerEmail,
      activo: company.mpPreapprovalStatus === PreapprovalStatus.AUTHORIZED,
      deudaPendiente: await this.dunning.deudaTotal(companyId),
    };
  }

  /**
   * Crea la suscripción recurrente.
   *
   * **Exige estar al día.** Es la misma regla que Aturna y no es burocracia: el
   * débito arranca en el próximo período, así que activarlo con deuda encima
   * dejaría al cliente creyendo que quedó todo resuelto mientras la deuda vieja
   * sigue corriendo hacia el bloqueo. Primero se salda con el link de pago,
   * después se automatiza.
   */
  async crearDebitoAutomatico(
    companyId: string,
    usuarioId: string,
    emailIndicado?: string,
  ) {
    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: companyId } }),
    );
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    const payerEmail = await this.resolverPagador(
      companyId,
      usuarioId,
      emailIndicado,
    );

    if (company.mpPreapprovalStatus === PreapprovalStatus.AUTHORIZED) {
      throw new BadRequestException(
        'La empresa ya tiene el débito automático activo.',
      );
    }

    const deuda = await this.dunning.deudaTotal(companyId);
    if (deuda > 0) {
      throw new BadRequestException(
        'Antes de activar el débito automático hay que saldar los períodos ' +
          'pendientes. Podés pagarlos con el link de pago.',
      );
    }

    const { desglose } = await runAsCompany(companyId, () =>
      this.billing.cotizar(companyId),
    );
    if (!(desglose.amount > 0)) {
      throw new BadRequestException(
        'La empresa no tiene un importe mensual a cobrar.',
      );
    }

    // Arranca en el próximo período: el actual ya está saldado (se verificó
    // arriba), así que cobrarlo de nuevo ahora sería cobrar dos veces.
    const { periodEnd } = this.billing.periodoDe(
      new Date(),
      company.billingDay ?? 1,
    );
    const inicio = new Date(periodEnd);
    inicio.setDate(inicio.getDate() + 1);

    const cuerpo = {
      reason: 'Suscripción mensual a FleetLog',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: desglose.amount,
        currency_id: 'ARS',
        start_date: inicio.toISOString(),
      },
      back_url: `${this.urlDeRetorno}?debito=creado`,
      // El tipo del SDK no declara `notification_url` para las suscripciones,
      // pero la API sí lo acepta y es lo que hace que llegue el aviso de cada
      // débito. Sin él, el cobro automático funcionaría y nunca nos
      // enteraríamos de que entró la plata: la factura quedaría impaga y la
      // cuenta marcharía al bloqueo con el cliente pagando puntualmente.
      notification_url: this.urlDeAvisos,
      external_reference: companyId,
      payer_email: payerEmail,
    };

    const respuesta = await this.mp().preapproval.create({
      body: cuerpo as unknown as Parameters<
        PreApproval['create']
      >[0]['body'],
    });

    await runAsSystem(() =>
      this.companiesRepository.update(companyId, {
        mpPreapprovalId: respuesta.id ?? null,
        mpPreapprovalStatus: PreapprovalStatus.PENDING,
        mpPayerEmail: payerEmail,
      }),
    );

    await this.auditLog.registrar(null, {
      action: AUDIT.MP_SUBSCRIPTION_CHANGED,
      companyId,
      entityType: 'company',
      entityId: companyId,
      metadata: {
        preapprovalId: respuesta.id,
        estado: PreapprovalStatus.PENDING,
        importe: desglose.amount,
        desde: inicio,
      },
    });

    return {
      preapprovalId: respuesta.id,
      amount: desglose.amount,
      desde: inicio,
      url: respuesta.init_point,
    };
  }

  /** Cancela el débito automático en MP y en la base. */
  async cancelarDebitoAutomatico(companyId: string) {
    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: companyId } }),
    );
    if (!company?.mpPreapprovalId) {
      throw new BadRequestException(
        'La empresa no tiene débito automático activo.',
      );
    }

    await this.mp().preapproval.update({
      id: company.mpPreapprovalId,
      body: { status: 'cancelled' },
    });

    await runAsSystem(() =>
      this.companiesRepository.update(companyId, {
        mpPreapprovalStatus: PreapprovalStatus.CANCELLED,
      }),
    );

    await this.auditLog.registrar(null, {
      action: AUDIT.MP_SUBSCRIPTION_CHANGED,
      companyId,
      entityType: 'company',
      entityId: companyId,
      metadata: {
        preapprovalId: company.mpPreapprovalId,
        estado: PreapprovalStatus.CANCELLED,
      },
    });

    return { cancelado: true };
  }

  /**
   * Pone al día el importe del débito de cada empresa.
   *
   * Hace falta porque el precio de FleetLog **no es fijo**: depende de cuántas
   * unidades tenga la flota ese mes. Una suscripción de MP creada en marzo
   * seguiría debitando el importe de marzo para siempre, y la diferencia con lo
   * facturado quedaría impaga sin que nadie se entere. MP aplica el monto nuevo
   * a partir del ciclo siguiente.
   *
   * Nunca lanza: es un ajuste de conveniencia y no puede voltear el cron.
   */
  async sincronizarImportes(): Promise<number> {
    const empresas = await runAsSystem(() =>
      this.companiesRepository.find({
        where: {
          mpPreapprovalStatus: PreapprovalStatus.AUTHORIZED,
          isPlatform: false,
        },
      }),
    );

    let actualizadas = 0;

    for (const company of empresas) {
      if (!company.mpPreapprovalId) continue;

      try {
        const { desglose } = await runAsCompany(company.id, () =>
          this.billing.cotizar(company.id),
        );
        if (!(desglose.amount > 0)) continue;

        await this.mp().preapproval.update({
          id: company.mpPreapprovalId,
          body: {
            auto_recurring: {
              transaction_amount: desglose.amount,
              currency_id: 'ARS',
            },
          },
        });
        actualizadas++;
      } catch (e) {
        this.logger.error(
          `No se pudo sincronizar el importe de ${company.name} (${company.id}): ${String(e)}`,
        );
      }
    }

    return actualizadas;
  }

  // ──────────────────────── Confirmación de avisos ──────────────────────────

  /**
   * Acredita un pago informado por Mercado Pago.
   *
   * **El importe y el estado se leen de MP, nunca del cuerpo del aviso.** El
   * webhook es un endpoint público: si se confiara en lo que llega, cualquiera
   * podría marcar su cuenta como paga mandando un JSON. El aviso sólo dice qué
   * mirar; lo que vale es la respuesta de la API con nuestro token.
   */
  async confirmarPago(mpPaymentId: string): Promise<ResultadoConfirmacion> {
    if (!mpPaymentId) throw new BadRequestException('Falta el id del pago.');

    // Primera barrera: el pago ya registrado. La segunda —la que de verdad
    // sostiene R9.2— es el índice único, más abajo.
    const yaRegistrado = await runAsSystem(() =>
      this.paymentsRepository.findOne({ where: { mpPaymentId } }),
    );
    if (yaRegistrado) {
      return {
        duplicado: true,
        companyId: yaRegistrado.companyId,
        subscriptionId: yaRegistrado.subscriptionId,
      };
    }

    const mpPago = await this.mp().payment.get({ id: mpPaymentId });
    if (!mpPago?.status) {
      throw new BadRequestException('No se pudo leer el pago en Mercado Pago.');
    }

    const referencia = mpPago.external_reference;
    if (!referencia) {
      throw new BadRequestException('El pago no trae external_reference.');
    }

    const estado = this.traducirEstado(mpPago.status);
    const importe = Number(mpPago.transaction_amount) || 0;

    const destino = await this.resolverDestino(referencia, importe);
    if (!destino) {
      throw new NotFoundException(
        `No se encontró a qué período imputar el pago (referencia ${referencia}).`,
      );
    }

    const { companyId, subscription } = destino;

    // El registro del pago va en contexto de la empresa: `Payment` es una
    // entidad de empresa y el subscriber exige saber de cuál.
    let acreditado = false;

    try {
      await runAsCompany(companyId, async () => {
        await this.paymentsRepository.save(
          this.paymentsRepository.create({
            companyId,
            subscriptionId: subscription.id,
            paidAt: this.soloFecha(
              mpPago.date_approved ? new Date(mpPago.date_approved) : new Date(),
            ) as unknown as Date,
            amount: importe,
            method: PaymentMethod.MERCADOPAGO,
            status: estado,
            mpPaymentId,
            mpPreapprovalId: mpPago.metadata?.preapproval_id
              ? String(mpPago.metadata.preapproval_id)
              : null,
            reference: `MP ${mpPaymentId}`,
          }),
        );

        // Sólo acredita lo aprobado, y sólo si alcanza para el período. Un pago
        // parcial queda registrado —para poder explicárselo al cliente— pero no
        // cancela la deuda ni levanta el bloqueo.
        if (estado === PaymentStatusMp.PAID && importe + 0.01 >= Number(subscription.amount)) {
          await this.billing.marcarPagada(subscription.id);
          acreditado = true;
        }
      });
    } catch (e) {
      // Dos copias del mismo aviso procesándose a la vez: la que perdió la
      // carrera se descarta. Es el caso que el `SELECT` de arriba no cubre.
      if (this.esDuplicado(e)) {
        return { duplicado: true, companyId, subscriptionId: subscription.id };
      }
      throw e;
    }

    if (acreditado) {
      await this.dunning.regularizar(companyId);
      await this.avisos.pagoRecibido(companyId, {
        amount: importe,
        periodStart: subscription.periodStart,
      });
    }

    await this.auditLog.registrar(null, {
      action: AUDIT.MP_PAYMENT_RECEIVED,
      companyId,
      entityType: 'subscription',
      entityId: subscription.id,
      metadata: { mpPaymentId, importe, estado, acreditado },
    });

    return {
      duplicado: false,
      status: estado,
      companyId,
      subscriptionId: subscription.id,
      acreditado,
    };
  }

  /**
   * Actualiza el estado del débito automático a partir de un aviso.
   *
   * Importa porque el cliente puede pausar o cancelar la suscripción desde su
   * propia cuenta de MP, sin pasar por FleetLog. Si no se escuchara este aviso,
   * la empresa figuraría con cobro automático activo hasta que alguien notara
   * que hace tres meses que no entra plata.
   */
  async confirmarPreapproval(preapprovalId: string) {
    const preapproval = await this.mp().preapproval.get({ id: preapprovalId });

    const companyId = preapproval?.external_reference;
    if (!companyId) {
      throw new BadRequestException(
        'La suscripción de MP no trae external_reference.',
      );
    }

    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: companyId } }),
    );
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    const estado = this.traducirEstadoPreapproval(preapproval.status);

    await runAsSystem(() =>
      this.companiesRepository.update(companyId, {
        mpPreapprovalId: preapprovalId,
        mpPreapprovalStatus: estado,
      }),
    );

    await this.auditLog.registrar(null, {
      action: AUDIT.MP_SUBSCRIPTION_CHANGED,
      companyId,
      entityType: 'company',
      entityId: companyId,
      metadata: { preapprovalId, estado, informadoPorMp: preapproval.status },
    });

    return { companyId, estado };
  }

  // ────────────────────────────── Internos ──────────────────────────────────

  /**
   * Email del pagador de la suscripción.
   *
   * MP lo exige y lo usa para mandarle los comprobantes de cada débito. Se
   * prefiere el que se indique, después el de quien activa el débito —que es
   * quien está tomando la decisión— y por último el de facturación. El token no
   * lleva el email, así que se busca en la base.
   */
  private async resolverPagador(
    companyId: string,
    usuarioId: string,
    indicado?: string,
  ): Promise<string> {
    if (indicado) return indicado;

    const [usuario]: { email: string }[] =
      await this.companiesRepository.query(
        'SELECT `email` FROM `user` WHERE `id` = ? LIMIT 1',
        [usuarioId],
      );
    if (usuario?.email) return usuario.email;

    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: companyId } }),
    );
    if (company?.invoiceEmail) return company.invoiceEmail;

    throw new BadRequestException(
      'Hace falta un email para el débito automático: cargá el email de ' +
        'facturación de la empresa o indicá uno.',
    );
  }

  /**
   * A qué período se imputa un pago.
   *
   * La referencia puede ser de dos tipos, y hay que aceptar los dos:
   *
   *  - **Un período**, cuando el pago salió de un link nuestro.
   *  - **Una empresa**, cuando lo generó el débito automático: la referencia
   *    del `preapproval` es la empresa, y MP la copia en cada débito.
   *
   * En el segundo caso se busca el período impago **más viejo** —es el que está
   * más cerca del bloqueo—, prefiriendo uno cuyo importe coincida con lo
   * cobrado, que es la señal más fuerte de a cuál corresponde.
   */
  private async resolverDestino(
    referencia: string,
    importe: number,
  ): Promise<{ companyId: string; subscription: Subscription } | null> {
    const porPeriodo = await runAsSystem(() =>
      this.subscriptionsRepository.findOne({ where: { id: referencia } }),
    );
    if (porPeriodo) {
      return { companyId: porPeriodo.companyId, subscription: porPeriodo };
    }

    const company = await runAsSystem(() =>
      this.companiesRepository.findOne({ where: { id: referencia } }),
    );
    if (!company) return null;

    const impagos = await runAsSystem(() =>
      this.subscriptionsRepository.find({
        where: {
          companyId: company.id,
          isPaid: false,
          status: SubscriptionStatus.ISSUED,
        },
        order: { periodStart: 'ASC' },
      }),
    );

    const vencidos = await runAsSystem(() =>
      this.subscriptionsRepository.find({
        where: {
          companyId: company.id,
          isPaid: false,
          status: SubscriptionStatus.OVERDUE,
        },
        order: { periodStart: 'ASC' },
      }),
    );

    const candidatos = [...vencidos, ...impagos];
    if (!candidatos.length) return null;

    const exacto = candidatos.find(
      (s) => Math.abs(Number(s.amount) - importe) < 0.01,
    );

    return { companyId: company.id, subscription: exacto ?? candidatos[0] };
  }

  /**
   * MP tiene una decena de estados que significan lo mismo para la cobranza.
   * Sólo `approved` acredita: `in_process` es "todavía no".
   */
  private traducirEstado(estado: string): PaymentStatusMp {
    switch (estado) {
      case 'approved':
        return PaymentStatusMp.PAID;
      case 'pending':
      case 'in_process':
      case 'authorized':
        return PaymentStatusMp.PENDING;
      case 'refunded':
      case 'charged_back':
        return PaymentStatusMp.REFUNDED;
      case 'cancelled':
        return PaymentStatusMp.CANCELED;
      default:
        return PaymentStatusMp.REJECTED;
    }
  }

  private traducirEstadoPreapproval(estado?: string): PreapprovalStatus {
    switch (estado) {
      case 'authorized':
        return PreapprovalStatus.AUTHORIZED;
      case 'pending':
        return PreapprovalStatus.PENDING;
      case 'paused':
        return PreapprovalStatus.PAUSED;
      default:
        return PreapprovalStatus.CANCELLED;
    }
  }

  private esDuplicado(e: unknown): boolean {
    const error = e as { code?: string; driverError?: { code?: string } };
    return (
      error?.code === ER_DUP_ENTRY || error?.driverError?.code === ER_DUP_ENTRY
    );
  }

  private fecha(valor: Date | string): string {
    return new Date(valor).toLocaleDateString('es-AR');
  }

  private soloFecha(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
}
