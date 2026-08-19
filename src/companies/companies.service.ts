import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcryptjs from 'bcryptjs';
import { Company } from './entities/company.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { User } from 'src/users/entities/user.entity';
import { CompanyStatus } from 'src/common/enums/companyStatus.enum';
import { Role } from 'src/common/enums/role.enum';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/**
 * Días de prueba gratuita.
 *
 * El trial es del plan **Operación**, no de Control: quien probó rendiciones y
 * el tablero de combustible durante un mes no compara Control contra nada,
 * lo compara contra lo que ya tenía (MODELO-COMERCIAL §6.1).
 */
export const DIAS_DE_TRIAL = 30;
export const PLAN_DE_TRIAL = 'operacion';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Alta pública de una empresa con su usuario administrador.
   *
   * **Todo en una sola transacción.** Una empresa creada sin su administrador es
   * un tenant huérfano al que nadie puede entrar y que después hay que limpiar a
   * mano (riesgo R6.2).
   *
   * Corre en contexto de sistema porque todavía no hay empresa: el request es
   * anónimo y el filtrado por empresa no tiene con qué filtrar.
   */
  async register(dto: RegisterCompanyDto): Promise<{
    companyId: string;
    slug: string;
    trialEndsAt: Date;
    adminEmail: string;
  }> {
    return runAsSystem(async () => {
      // El email es único global (decisión D1): se chequea antes de abrir la
      // transacción para devolver un 409 claro en lugar de un error de índice.
      const existente = await this.dataSource
        .getRepository(User)
        .findOne({ where: { email: dto.adminEmail.toLowerCase() } });

      if (existente) {
        throw new ConflictException(
          'Ya existe una cuenta con ese email. Iniciá sesión o recuperá tu contraseña.',
        );
      }

      const plan = await this.dataSource
        .getRepository(Plan)
        .findOne({ where: { code: PLAN_DE_TRIAL } });

      if (!plan) {
        // Sin catálogo no se puede dar de alta: es un error de instalación, no
        // del usuario.
        this.logger.error(
          `No existe el plan "${PLAN_DE_TRIAL}": ¿corrieron las migraciones?`,
        );
        throw new NotFoundException(
          'No se pudo completar el alta. Contactanos para ayudarte.',
        );
      }

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + DIAS_DE_TRIAL);
      trialEndsAt.setHours(23, 59, 59, 0);

      return this.dataSource.transaction(async (manager) => {
        const slug = await this.generarSlug(dto.companyName, manager);

        const company = await manager.getRepository(Company).save(
          manager.getRepository(Company).create({
            name: dto.companyName.trim(),
            slug,
            cuit: dto.cuit ?? null,
            status: CompanyStatus.TRIAL,
            trialEndsAt,
            planId: plan.id,
            billingDay: new Date().getDate(),
            invoiceEmail: dto.adminEmail.toLowerCase(),
            onboardingStep: 1,
          } as Partial<Company>),
        );

        await manager.getRepository(User).save(
          manager.getRepository(User).create({
            companyId: company.id,
            email: dto.adminEmail.toLowerCase(),
            name: dto.adminName.trim(),
            password: await bcryptjs.hash(dto.adminPassword, 10),
            role: Role.ADMIN,
            phone: dto.phone,
          } as Partial<User>),
        );

        // No hace falta sembrar nada más: los umbrales de alerta y los ítems de
        // checklist y OEA son constantes del código con valor por defecto, así
        // que una empresa nueva ya opera sin filas de configuración propias.

        this.logger.log(
          `Empresa dada de alta: ${company.name} (${slug}), trial hasta ${trialEndsAt.toISOString().slice(0, 10)}.`,
        );

        return {
          companyId: company.id,
          slug,
          trialEndsAt,
          adminEmail: dto.adminEmail.toLowerCase(),
        };
      });
    });
  }

  /**
   * Slug único a partir de la razón social.
   *
   * Si ya existe, agrega un sufijo numérico en vez de fallar: que dos empresas
   * se llamen parecido es normal y no puede frenar un alta (riesgo R6.3).
   */
  private async generarSlug(
    nombre: string,
    manager: { getRepository: typeof DataSource.prototype.getRepository },
  ): Promise<string> {
    const base =
      nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // acentos
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'empresa';

    const repo = manager.getRepository(Company);

    for (let i = 0; i < 50; i++) {
      const candidato = i === 0 ? base : `${base}-${i + 1}`;
      const ocupado = await repo.findOne({ where: { slug: candidato } });
      if (!ocupado) return candidato;
    }

    // Salida de emergencia: sufijo aleatorio. Preferible a rechazar el alta.
    return `${base}-${Date.now().toString(36)}`;
  }

  findOne(id: string): Promise<Company | null> {
    return this.companiesRepository.findOne({ where: { id } });
  }

  /** Avance del onboarding guiado. */
  async actualizarOnboarding(
    companyId: string,
    step: number,
  ): Promise<Company> {
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    company.onboardingStep = step;
    return this.companiesRepository.save(company);
  }

  /** Datos fiscales y de presentación de la empresa. */
  async actualizar(
    companyId: string,
    datos: Partial<Company>,
  ): Promise<Company> {
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    // Lista blanca: el estado comercial, el plan y el consumo no se tocan desde
    // acá; los maneja facturación y el superadmin.
    const permitidos: (keyof Company)[] = [
      'name',
      'cuit',
      'phone',
      'address',
      'city',
      'state',
      'invoiceEmail',
      'invoiceCuit',
      'invoiceName',
      'logoUrl',
      'primaryColor',
      'onboardingStep',
    ];

    for (const campo of permitidos) {
      if (datos[campo] !== undefined) {
        (company as unknown as Record<string, unknown>)[campo] = datos[campo];
      }
    }

    return this.companiesRepository.save(company);
  }
}
