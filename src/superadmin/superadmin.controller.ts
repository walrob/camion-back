import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { Plan } from 'src/plans/entities/plan.entity';
import { AUDIT, AuditLogService } from 'src/audit-log/audit-log.service';
import { SuperadminService } from './superadmin.service';
import { ImpersonationService } from './impersonation.service';

/**
 * Panel de operación de la plataforma.
 *
 * **Todo el controlador exige `Role.SUPERADMIN`**, así que un administrador de
 * empresa que fuerce la URL recibe un 403 del backend, no sólo un redirect del
 * front.
 *
 * Cada acción que cambia algo se audita acá y no en el servicio: es donde está
 * el request, con la IP y el user agent que hacen falta para investigar después.
 */
@ApiTags('Superadmin')
@ApiBearerAuth()
@Auth(Role.SUPERADMIN)
@Controller('superadmin')
export class SuperadminController {
  constructor(
    private readonly superadmin: SuperadminService,
    private readonly impersonation: ImpersonationService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Tablero y consultas ──────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'MRR, altas, mora y trials por vencer.' })
  tablero() {
    return this.superadmin.tablero();
  }

  @Get('companies')
  @ApiOperation({ summary: 'Empresas con sus métricas de uso.' })
  empresas(@Query('estado') estado?: string, @Query('plan') plan?: string) {
    return this.superadmin.listarEmpresas({ estado, plan });
  }

  @Get('companies/:id')
  @ApiOperation({ summary: 'Ficha de una empresa: plan, add-ons, períodos, uso.' })
  async verEmpresa(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
    @Req() req: Request,
  ) {
    const ficha = await this.superadmin.verEmpresa(id);

    // Se audita también la LECTURA: acceder a los datos de un cliente es
    // justamente el privilegio que hay que poder rendir (riesgo R8.1).
    await this.auditLog.registrar(
      user,
      {
        action: AUDIT.SUPERADMIN_VIEWED_COMPANY,
        companyId: id,
        entityType: 'company',
        entityId: id,
      },
      req as never,
    );

    return ficha;
  }

  @Get('billing')
  @ApiOperation({ summary: 'Períodos impagos de todas las empresas.' })
  cobranzas() {
    return this.superadmin.cobranzas();
  }

  // ── Acciones sobre una empresa ───────────────────────────────────────────

  @Patch('companies/:id/status')
  @ApiOperation({ summary: 'Cambia el estado comercial de una empresa.' })
  async cambiarEstado(
    @Param('id') id: string,
    @Body() body: { status: CompanyStatus; motivo?: string },
    @ActiveUser() user: ActiveUserInterface,
    @Req() req: Request,
  ) {
    const r = await this.superadmin.cambiarEstado(id, body.status);

    await this.auditLog.registrar(
      user,
      {
        action: AUDIT.COMPANY_STATUS_CHANGED,
        companyId: id,
        entityType: 'company',
        entityId: id,
        metadata: { de: r.anterior, a: r.actual, motivo: body.motivo },
      },
      req as never,
    );

    return r;
  }

  @Patch('companies/:id/plan')
  @ApiOperation({
    summary:
      'Cambia el plan usando el mismo flujo del cliente: upgrade con ' +
      'prorrateo, downgrade diferido a la renovación.',
  })
  async cambiarPlan(
    @Param('id') id: string,
    @Body() body: { planCode: string; motivo?: string },
    @ActiveUser() user: ActiveUserInterface,
    @Req() req: Request,
  ) {
    const r = await this.superadmin.cambiarPlan(id, body.planCode, user.id);

    await this.auditLog.registrar(
      user,
      {
        action: AUDIT.COMPANY_PLAN_CHANGED,
        companyId: id,
        entityType: 'company',
        entityId: id,
        metadata: {
          plan: body.planCode,
          aplicado: r.aplicado,
          efectivoEl: r.efectivoEl,
          motivo: body.motivo,
        },
      },
      req as never,
    );

    return r;
  }

  @Post('companies/:id/billing/issue')
  @ApiOperation({ summary: 'Emite el período en curso a mano.' })
  async emitir(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
    @Req() req: Request,
  ) {
    const sub = await this.superadmin.emitirPeriodo(id);

    await this.auditLog.registrar(
      user,
      {
        action: AUDIT.BILLING_PERIOD_ISSUED,
        companyId: id,
        entityType: 'subscription',
        entityId: sub?.id ?? null,
        metadata: { amount: sub?.amount, yaExistia: !sub },
      },
      req as never,
    );

    return sub ?? { message: 'El período ya estaba emitido.' };
  }

  @Post('companies/:id/billing/:subscriptionId/paid')
  @ApiOperation({ summary: 'Registra el cobro de un período.' })
  async marcarPagada(
    @Param('id') id: string,
    @Param('subscriptionId') subscriptionId: string,
    @ActiveUser() user: ActiveUserInterface,
    @Req() req: Request,
  ) {
    const sub = await this.superadmin.marcarPagada(id, subscriptionId);

    await this.auditLog.registrar(
      user,
      {
        action: AUDIT.BILLING_PAYMENT_REGISTERED,
        companyId: id,
        entityType: 'subscription',
        entityId: subscriptionId,
        metadata: { amount: sub.amount },
      },
      req as never,
    );

    return sub;
  }

  // ── Catálogo ─────────────────────────────────────────────────────────────

  @Patch('plans/:code')
  @ApiOperation({
    summary: 'Edita un plan (precios, features, límites) sin necesidad de deploy.',
  })
  async actualizarPlan(
    @Param('code') code: string,
    @Body() datos: Partial<Plan>,
    @ActiveUser() user: ActiveUserInterface,
    @Req() req: Request,
  ) {
    const plan = await this.superadmin.actualizarPlan(code, datos);

    await this.auditLog.registrar(
      user,
      {
        action: AUDIT.PLAN_UPDATED,
        companyId: null, // acción global: no es de ninguna empresa
        entityType: 'plan',
        entityId: plan.id,
        metadata: { code, cambios: Object.keys(datos) },
      },
      req as never,
    );

    return plan;
  }

  // ── Soporte ──────────────────────────────────────────────────────────────

  @Post('companies/:id/impersonate')
  @ApiOperation({
    summary:
      'Token de SOLO LECTURA para ver la cuenta del cliente. Dura 30 minutos ' +
      'y queda auditado.',
  })
  async impersonar(
    @Param('id') id: string,
    @Body() body: { motivo?: string },
    @ActiveUser() user: ActiveUserInterface,
    @Req() req: Request,
  ) {
    const r = await this.impersonation.impersonar(id, user.id);

    await this.auditLog.registrar(
      user,
      {
        action: AUDIT.IMPERSONATION_STARTED,
        companyId: id,
        entityType: 'company',
        entityId: id,
        metadata: {
          comoUsuario: r.comoUsuario,
          expiraEn: r.expiresAt,
          motivo: body?.motivo,
        },
      },
      req as never,
    );

    return r;
  }
}
