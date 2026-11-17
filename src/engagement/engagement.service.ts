import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { EmailService } from 'src/notifications/email/email.service';
import { runAsSystem } from 'src/common/tenant/tenant-context';
import {
  HORAS_DE_VERIFICACION,
  PROPOSITO_VERIFICACION,
} from 'src/auth/auth.service';
import { EmailLog } from './entities/email-log.entity';
import {
  buildEngagementMessage,
  CLOSING,
  EngagementContext,
  SIGNATURE,
} from './engagement.copy';
import {
  activationGap,
  CompanyProgress,
  dueStep,
  EngagementSegment,
  firstName,
  firstTripGap,
  IGNORES_GAP,
  IGNORES_OPT_OUT,
  isBusinessHours,
  MIN_GAP_MS,
  SEGMENT_STEPS,
  signOptOutToken,
  verifyOptOutToken,
  withUtm,
} from './engagement.rules';

/** Un email que corresponde mandar en esta corrida. */
export interface PlannedEmail {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  companyName: string;
  segment: EngagementSegment;
  step: number;
  subject: string;
  /** Con qué variante de texto sale (qué le falta a la empresa). */
  context: Omit<EngagementContext, 'name' | 'verifyUrl' | 'replyTo'>;
}

interface Owner {
  userId: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  optOut: boolean;
  userCreatedAt: Date;
  companyId: string;
  companyName: string;
  companyCreatedAt: Date;
}

interface CompanyStats extends CompanyProgress {
  firstTripAt: Date | null;
  lastTripAt: Date | null;
  /** Último login de cualquiera de la empresa, choferes incluidos. */
  lastConnection: Date | null;
}

const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null);
const historyKey = (companyId: string, userId: string) =>
  `${companyId}:${userId}`;
const latest = (...dates: (Date | null | undefined)[]) =>
  Math.max(0, ...dates.filter(Boolean).map((d) => (d as Date).getTime()));

/**
 * Emails automáticos de activación y re-enganche para quien creó la empresa.
 *
 * Una vez por hora, en horario laboral de Argentina, evalúa al Administrador
 * que dio de alta cada empresa y le manda como mucho un email: el del segmento
 * de mayor prioridad que le toque (A > B > C > D). El estado se calcula siempre
 * sobre los datos reales, así que una secuencia se corta sola cuando la
 * persona hace lo que se le pedía.
 *
 * Sólo a ese Administrador: a los choferes, al resto del equipo y a los
 * invitados no se les escribe nunca.
 *
 * Es una tarea de plataforma, transversal a las empresas: corre en contexto de
 * sistema y escribe el log con la empresa explícita.
 *
 * Interruptores:
 * - `ACTIVATION_EMAILS_ENABLED=true` prende el cron. Sin eso no corre.
 * - `ACTIVATION_EMAILS_DRY_RUN`: si no es exactamente `false`, sólo loguea a
 *   quién se le mandaría qué, sin enviar ni grabar nada.
 */
@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  private get logs() {
    return this.dataSource.getRepository(EmailLog);
  }

  private get users() {
    return this.dataSource.getRepository(User);
  }

  isEnabled() {
    return process.env.ACTIVATION_EMAILS_ENABLED === 'true';
  }

  /**
   * DRY_RUN salvo que se apague a propósito: un error de tipeo en la variable
   * no puede terminar mandándole emails a todos los clientes. Con
   * `EMAIL_ENABLED=false` también: si no, se grabaría el log de emails que
   * nunca salieron y esos pasos ya no se mandarían.
   */
  isDryRun() {
    return (
      process.env.ACTIVATION_EMAILS_DRY_RUN !== 'false' ||
      process.env.EMAIL_ENABLED === 'false'
    );
  }

  // A los 5 minutos de cada hora: lejos de los crons en punto (facturación,
  // alertas, vencimientos).
  @Cron('5 * * * *')
  async handleCron() {
    if (!this.isEnabled()) return;
    const now = new Date();
    if (!isBusinessHours(now)) return;
    try {
      await this.run(now);
    } catch (error) {
      this.logger.error(
        `Error en los emails de activación: ${(error as Error)?.message}`,
      );
    }
  }

  async run(now = new Date()) {
    const dryRun = this.isDryRun();
    const plans = await this.plan(now);
    let sent = 0;

    for (const plan of plans) {
      if (dryRun) {
        this.logger.log(
          `[DRY_RUN] ${plan.email} (${plan.companyName}) → ${plan.segment} paso ${plan.step}: "${plan.subject}"`,
        );
        continue;
      }
      if (await this.send(plan)) sent++;
    }

    this.logger.log(
      dryRun
        ? `📧 Activación (DRY_RUN): ${plans.length} email(s) sin enviar.`
        : `📧 Activación: ${sent} de ${plans.length} enviado(s).`,
    );
    return plans;
  }

  // ---------------------------------------------------------------------------
  // Qué le toca a cada uno
  // ---------------------------------------------------------------------------

  plan(now = new Date()): Promise<PlannedEmail[]> {
    return runAsSystem(() => this.planEnSistema(now));
  }

  private async planEnSistema(now: Date): Promise<PlannedEmail[]> {
    const owners = await this.findOwners();
    if (!owners.length) return [];

    const [stats, sent] = await Promise.all([
      this.findCompanyStats(owners.map((o) => o.companyId)),
      this.findSent(owners.map((o) => o.userId)),
    ]);

    const nowMs = now.getTime();
    const plans: PlannedEmail[] = [];

    for (const owner of owners) {
      const history =
        sent.get(historyKey(owner.companyId, owner.userId)) ?? new Map();
      const lastStep = (segment: EngagementSegment) =>
        history.get(segment)?.step ?? 0;
      const push = (
        segment: EngagementSegment,
        step: number,
        context: PlannedEmail['context'] = {},
      ) => plans.push(this.toPlan(owner, segment, step, context));

      // A. Sin el correo confirmado no aplica ningún otro: ni siquiera puede
      // entrar.
      if (!owner.emailVerifiedAt) {
        const step = dueStep(
          EngagementSegment.UNVERIFIED,
          nowMs - owner.userCreatedAt.getTime(),
          lastStep(EngagementSegment.UNVERIFIED),
        );
        if (step) push(EngagementSegment.UNVERIFIED, step);
        continue;
      }

      if (owner.optOut) continue;

      // Tope de un email cada 3 días (A no lo consume).
      const lastSentAt = Math.max(
        0,
        ...[...history.entries()]
          .filter(([segment]) => !IGNORES_GAP.has(segment))
          .map(([, entry]) => entry.lastAt.getTime()),
      );
      if (lastSentAt && nowMs - lastSentAt < MIN_GAP_MS) continue;

      const company = stats.get(owner.companyId);
      if (!company) continue;

      if (!company.trips) {
        // B. La empresa todavía no tiene ningún viaje.
        const step = dueStep(
          EngagementSegment.ACTIVATION,
          nowMs - owner.companyCreatedAt.getTime(),
          lastStep(EngagementSegment.ACTIVATION),
        );
        if (step) {
          push(EngagementSegment.ACTIVATION, step, {
            activationGap: activationGap(company),
          });
          continue;
        }
      } else if (company.firstTripAt) {
        // C. Primer viaje cargado. Sólo si es reciente (es una felicitación, no
        // un aviso a cuentas viejas) y si todavía le falta algo que pedirle.
        const gap = firstTripGap(company);
        const step = gap
          ? dueStep(
              EngagementSegment.FIRST_TRIP,
              nowMs - company.firstTripAt.getTime(),
              lastStep(EngagementSegment.FIRST_TRIP),
            )
          : null;
        if (step && gap) {
          push(EngagementSegment.FIRST_TRIP, step, { firstTripGap: gap });
          continue;
        }
      }

      // D. Inactividad de la EMPRESA, no de la persona: el último login de
      // cualquiera del equipo —choferes incluidos— o el último viaje cargado.
      // Si los choferes cargan gastos todos los días, la empresa usa CamioNex
      // aunque el dueño no entre, y no se le pregunta si le sigue sirviendo.
      const lastUse = latest(
        company.lastConnection,
        company.lastTripAt,
        owner.emailVerifiedAt,
        owner.userCreatedAt,
      );
      const step = dueStep(
        EngagementSegment.INACTIVE,
        nowMs - lastUse,
        lastStep(EngagementSegment.INACTIVE),
      );
      if (step) push(EngagementSegment.INACTIVE, step);
    }

    return plans;
  }

  private toPlan(
    owner: Owner,
    segment: EngagementSegment,
    step: number,
    context: PlannedEmail['context'],
  ): PlannedEmail {
    const message = buildEngagementMessage(segment, step, {
      name: firstName(owner.name),
      ...context,
    });
    return {
      userId: owner.userId,
      email: owner.email,
      name: owner.name,
      companyId: owner.companyId,
      companyName: owner.companyName,
      segment,
      step,
      subject: message.subject,
      context,
    };
  }

  /**
   * El Administrador que dio de alta cada empresa viva: el primero que se
   * creó. Se dejan afuera la empresa de plataforma, las suspendidas por falta
   * de pago (ya reciben los avisos de cobro) y las dadas de baja.
   */
  private async findOwners(): Promise<Owner[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT u.id AS userId, u.email, u.name, u.emailVerifiedAt,
              u.emailMarketingOptOut AS optOut, u.createdAt AS userCreatedAt,
              c.id AS companyId, c.name AS companyName,
              c.createdAt AS companyCreatedAt
         FROM companies c
         JOIN \`user\` u ON u.id = (
              SELECT u2.id FROM \`user\` u2
               WHERE u2.companyId = c.id AND u2.role = 'admin'
                 AND u2.deletedAt IS NULL
               ORDER BY u2.createdAt ASC
               LIMIT 1)
        WHERE c.deletedAt IS NULL
          AND c.isPlatform = 0
          AND c.status NOT IN ('blocked', 'cancelled')
          AND u.blocked = 0
          AND u.isActive = 1`,
    );

    return rows.map((r) => ({
      userId: String(r.userId),
      email: String(r.email),
      name: String(r.name ?? ''),
      emailVerifiedAt: toDate(r.emailVerifiedAt),
      optOut: !!Number(r.optOut),
      userCreatedAt: new Date(r.userCreatedAt as string),
      companyId: String(r.companyId),
      companyName: String(r.companyName),
      companyCreatedAt: new Date(r.companyCreatedAt as string),
    }));
  }

  /**
   * Lo que cargó cada empresa. Las mismas cuentas que hacen los Primeros pasos
   * del panel (`OnboardingService`), para que el email y el panel digan lo
   * mismo.
   */
  private async findCompanyStats(ids: string[]) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT c.id AS companyId,
              (SELECT COUNT(*) FROM trucks t
                WHERE t.companyId = c.id AND t.deletedAt IS NULL) AS trucks,
              (SELECT COUNT(*) FROM drivers d
                WHERE d.companyId = c.id AND d.deletedAt IS NULL) AS drivers,
              (SELECT COUNT(*) FROM drivers d
                 JOIN employees e ON e.id = d.employeeId AND e.deletedAt IS NULL
                WHERE d.companyId = c.id AND d.deletedAt IS NULL
                  AND e.userId IS NOT NULL) AS driversWithApp,
              (SELECT COUNT(*) FROM documents doc
                WHERE doc.companyId = c.id AND doc.deletedAt IS NULL
                  AND doc.expiryDate IS NOT NULL) AS expirations,
              (SELECT COUNT(*) FROM trips tr
                WHERE tr.companyId = c.id AND tr.deletedAt IS NULL) AS trips,
              (SELECT MIN(tr.createdAt) FROM trips tr
                WHERE tr.companyId = c.id AND tr.deletedAt IS NULL) AS firstTripAt,
              (SELECT MAX(tr.createdAt) FROM trips tr
                WHERE tr.companyId = c.id AND tr.deletedAt IS NULL) AS lastTripAt,
              (SELECT MAX(u.lastConnection) FROM \`user\` u
                WHERE u.companyId = c.id AND u.deletedAt IS NULL) AS lastConnection
         FROM companies c
        WHERE c.id IN (?)`,
      [ids],
    );

    return new Map<string, CompanyStats>(
      rows.map((r) => [
        String(r.companyId),
        {
          trucks: Number(r.trucks) || 0,
          drivers: Number(r.drivers) || 0,
          driversWithApp: Number(r.driversWithApp) || 0,
          expirations: Number(r.expirations) || 0,
          trips: Number(r.trips) || 0,
          firstTripAt: toDate(r.firstTripAt),
          lastTripAt: toDate(r.lastTripAt),
          lastConnection: toDate(r.lastConnection),
        },
      ]),
    );
  }

  /** Último paso enviado de cada segmento, por empresa y usuario. */
  private async findSent(userIds: string[]) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT companyId, userId, segment, MAX(step) AS step, MAX(sentAt) AS lastAt
         FROM email_log
        WHERE userId IN (?)
        GROUP BY companyId, userId, segment`,
      [userIds],
    );

    const result = new Map<
      string,
      Map<EngagementSegment, { step: number; lastAt: Date }>
    >();
    for (const r of rows) {
      const key = historyKey(String(r.companyId), String(r.userId));
      const perUser = result.get(key) ?? new Map();
      perUser.set(r.segment as EngagementSegment, {
        step: Number(r.step) || 0,
        lastAt: new Date(r.lastAt as string),
      });
      result.set(key, perUser);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Envío
  // ---------------------------------------------------------------------------

  /**
   * Graba el log y manda. El log va primero porque su id es el del link con
   * seguimiento de clics, y porque el índice único frena un duplicado. Si el
   * envío falla se borra, para que se reintente en la próxima corrida.
   */
  private async send(plan: PlannedEmail): Promise<boolean> {
    try {
      const message = buildEngagementMessage(plan.segment, plan.step, {
        name: firstName(plan.name),
        verifyUrl:
          plan.segment === EngagementSegment.UNVERIFIED
            ? this.verifyUrl(plan.userId)
            : undefined,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
        ...plan.context,
      });

      let log: EmailLog;
      try {
        log = await this.logs.save(
          this.logs.create({
            companyId: plan.companyId,
            userId: plan.userId,
            segment: plan.segment,
            step: plan.step,
            targetUrl: withUtm(message.target, plan.segment, plan.step),
          }),
        );
      } catch {
        // Ya estaba (otra corrida u otra instancia lo mandó).
        return false;
      }

      const links = this.optOutLinks(plan.userId, plan.segment);
      try {
        await this.emailService.sendEngagementEmail({
          to: plan.email,
          subject: message.subject,
          titulo: message.title,
          parrafos: message.paragraphs,
          nota: message.note,
          cta: {
            texto: message.ctaLabel,
            url: `${this.backUrl()}engagement/c/${log.id}`,
          },
          cierre: CLOSING,
          firma: SIGNATURE,
          bajaUrl: links.unsubscribeUrl,
          bajaUnClicUrl: links.oneClickUrl,
        });
        return true;
      } catch (error) {
        await this.logs.delete(log.id);
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `No se pudo mandar ${plan.segment} paso ${plan.step} a ${plan.userId}: ${(error as Error)?.message}`,
      );
      return false;
    }
  }

  /**
   * Link de verificación nuevo, firmado igual que el del alta
   * (`AuthService.enviarVerificacion`): el del registro dura 24 horas y para
   * el tercer recordatorio ya venció.
   */
  private verifyUrl(userId: string): string {
    const token = this.jwtService.sign(
      { sub: userId, proposito: PROPOSITO_VERIFICACION },
      { expiresIn: `${HORAS_DE_VERIFICACION}h` },
    );
    return `${process.env.FRONT_URL}/auth/verify-email?token=${token}`;
  }

  private backUrl() {
    const url = process.env.BACK_URL ?? '';
    return url.endsWith('/') ? url : `${url}/`;
  }

  /** Links de baja: la página del front y el de un clic del encabezado. */
  private optOutLinks(userId: string, segment: EngagementSegment) {
    if (IGNORES_OPT_OUT.has(segment)) {
      return { unsubscribeUrl: null, oneClickUrl: null };
    }
    const token = encodeURIComponent(signOptOutToken(userId));
    return {
      unsubscribeUrl: `${process.env.FRONT_URL}/emails/baja?t=${token}`,
      oneClickUrl: `${this.backUrl()}engagement/unsubscribe/one-click?t=${token}`,
    };
  }

  /**
   * Manda a quien lo pide (un superadmin) cualquier paso, para ver cómo se ve.
   * No graba log ni cuenta para nada; los links van directo, sin seguimiento.
   */
  async sendTest(userId: string, segment: EngagementSegment, step: number) {
    const steps = SEGMENT_STEPS[segment];
    if (!steps || step < 1 || step > steps.length) {
      throw new NotFoundException('Ese paso no existe.');
    }
    const user = await runAsSystem(() => this.users.findOneBy({ id: userId }));
    if (!user) throw new NotFoundException('No se encontró el usuario.');

    const message = buildEngagementMessage(segment, step, {
      name: firstName(user.name),
      verifyUrl: `${process.env.FRONT_URL}/auth/verify-email?token=prueba`,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      activationGap: 'truck',
      firstTripGap: 'driverApp',
    });
    const links = this.optOutLinks(user.id, segment);
    await this.emailService.sendEngagementEmail({
      to: user.email,
      subject: `[Prueba] ${message.subject}`,
      titulo: message.title,
      parrafos: message.paragraphs,
      nota: message.note,
      cta: {
        texto: message.ctaLabel,
        url: withUtm(message.target, segment, step),
      },
      cierre: CLOSING,
      firma: SIGNATURE,
      bajaUrl: links.unsubscribeUrl,
    });
    return {
      to: user.email,
      subject: message.subject,
      sent: process.env.EMAIL_ENABLED !== 'false',
    };
  }

  // ---------------------------------------------------------------------------
  // Clics y baja
  // ---------------------------------------------------------------------------

  /** Registra el primer clic y devuelve a dónde redirigir. */
  registerClick(id: string): Promise<string> {
    return runAsSystem(async () => {
      const log = await this.logs.findOneBy({ id });
      if (!log) return process.env.FRONT_URL ?? '/';
      if (!log.clickAt) {
        await this.logs.update(id, { clickAt: new Date() });
      }
      return log.targetUrl;
    });
  }

  private async userFromToken(token?: string | null) {
    const userId = verifyOptOutToken(token);
    const user = userId
      ? await runAsSystem(() => this.users.findOneBy({ id: userId }))
      : null;
    if (!user) throw new NotFoundException('El link no es válido.');
    return user;
  }

  async getOptOut(token: string) {
    const user = await this.userFromToken(token);
    return {
      name: firstName(user.name),
      email: maskEmail(user.email),
      optOut: !!user.emailMarketingOptOut,
    };
  }

  async setOptOut(token: string, optOut: boolean) {
    const user = await this.userFromToken(token);
    await runAsSystem(() =>
      this.users.update(user.id, {
        emailMarketingOptOut: optOut,
        emailMarketingOptOutAt: optOut ? new Date() : null,
      }),
    );
    return { optOut };
  }

  // ---------------------------------------------------------------------------
  // Métricas
  // ---------------------------------------------------------------------------

  /**
   * Por segmento y paso: enviados, clics y activación posterior. Activación es
   * que la empresa haya hecho lo que el email pedía después de recibirlo:
   * A confirmó el correo · B cargó un viaje · C le dio la app a un chofer o
   * cargó un vencimiento · D alguien de la empresa volvió a entrar.
   */
  getMetrics(days: number) {
    return runAsSystem(() => this.metricsEnSistema(days));
  }

  private async metricsEnSistema(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT l.segment, l.step,
              COUNT(*) AS sent,
              SUM(l.clickAt IS NOT NULL) AS clicks,
              SUM(CASE
                WHEN l.segment = 'unverified' THEN u.emailVerifiedAt > l.sentAt
                WHEN l.segment = 'activation' THEN EXISTS (
                  SELECT 1 FROM trips tr
                   WHERE tr.companyId = l.companyId AND tr.deletedAt IS NULL
                     AND tr.createdAt > l.sentAt)
                WHEN l.segment = 'first_trip' THEN (
                  EXISTS (
                    SELECT 1 FROM \`user\` du
                     WHERE du.companyId = l.companyId AND du.role = 'driver'
                       AND du.deletedAt IS NULL AND du.createdAt > l.sentAt)
                  OR EXISTS (
                    SELECT 1 FROM documents doc
                     WHERE doc.companyId = l.companyId AND doc.deletedAt IS NULL
                       AND doc.expiryDate IS NOT NULL
                       AND doc.createdAt > l.sentAt))
                WHEN l.segment = 'inactive' THEN EXISTS (
                  SELECT 1 FROM \`user\` au
                   WHERE au.companyId = l.companyId AND au.deletedAt IS NULL
                     AND au.lastConnection > l.sentAt)
                ELSE 0 END) AS activated
         FROM email_log l
         LEFT JOIN \`user\` u ON u.id = l.userId
        WHERE l.sentAt >= ?
        GROUP BY l.segment, l.step
        ORDER BY l.segment, l.step`,
      [since],
    );

    const rate = (part: number, total: number) =>
      total ? Math.round((part / total) * 1000) / 10 : 0;

    const steps = rows.map((r) => {
      const sent = Number(r.sent) || 0;
      const clicks = Number(r.clicks) || 0;
      const activated = Number(r.activated) || 0;
      return {
        segment: r.segment as EngagementSegment,
        step: Number(r.step),
        sent,
        clicks,
        activated,
        clickRate: rate(clicks, sent),
        activationRate: rate(activated, sent),
      };
    });

    const segments = Object.values(EngagementSegment).map((segment) => {
      const own = steps.filter((s) => s.segment === segment);
      const sent = own.reduce((acc, s) => acc + s.sent, 0);
      const clicks = own.reduce((acc, s) => acc + s.clicks, 0);
      const activated = own.reduce((acc, s) => acc + s.activated, 0);
      return {
        segment,
        sent,
        clicks,
        activated,
        clickRate: rate(clicks, sent),
        activationRate: rate(activated, sent),
      };
    });

    const optedOut = await this.users.count({
      where: { emailMarketingOptOut: true },
    });

    return {
      days,
      enabled: this.isEnabled(),
      dryRun: this.isDryRun(),
      businessHoursNow: isBusinessHours(new Date()),
      optedOut,
      segments,
      steps,
    };
  }
}

/** a***@dominio.com: lo justo para que la persona reconozca su casilla. */
function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}
