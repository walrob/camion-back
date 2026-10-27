import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Truck } from 'src/fleet/entities/truck.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Document } from 'src/documents/entities/document.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { TripStatus } from 'src/common/enums/tripStatus.enum';

export type OnboardingStepKey =
  | 'trucks'
  | 'drivers'
  | 'driverApp'
  | 'expirations'
  | 'trip'
  | 'tripFinished'
  | 'logo';

export interface OnboardingStep {
  key: OnboardingStepKey;
  done: boolean;
  /** No cuenta para el progreso ni para dar la guía por terminada. */
  optional?: boolean;
}

/**
 * Primeros pasos de una empresa nueva.
 *
 * El progreso sale de los **datos reales**, no de que alguien haya tocado un
 * botón: un paso "Cargá tu flota" marcado como hecho con la flota vacía es peor
 * que no tener guía, porque deja de recordar lo que falta.
 *
 * El orden es el del camino más corto a ver el sistema andando: sin camiones y
 * choferes no hay viaje, sin acceso a la app el chofer no lo recibe, y sin
 * vencimientos cargados las alertas —lo que más valor da— nunca se disparan.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Truck)
    private readonly trucksRepository: Repository<Truck>,
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
  ) {}

  async progreso(
    companyId: string,
  ): Promise<{ steps: OnboardingStep[]; hidden: boolean }> {
    const company = await this.companiesRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    // Oculta: no se calcula nada, el front no la va a mostrar.
    if (company.onboardingStep <= 0) return { steps: [], hidden: true };

    // Los repositorios de tenant ya filtran por la empresa del request.
    const [trucks, drivers, driverApp, expirations, trips, tripsFinished] =
      await Promise.all([
        this.trucksRepository.count(),
        this.driversRepository.count(),
        // El acceso a la app vive en el legajo: un chofer sin usuario no
        // recibe los viajes que se le asignan.
        this.driversRepository
          .createQueryBuilder('driver')
          .innerJoin('driver.employee', 'employee')
          .where('employee.userId IS NOT NULL')
          .getCount(),
        this.documentsRepository.count({
          where: { expiryDate: Not(IsNull()) },
        }),
        this.tripsRepository.count(),
        this.tripsRepository.count({
          where: { status: TripStatus.FINISHED },
        }),
      ]);

    return {
      hidden: false,
      steps: [
        { key: 'trucks', done: trucks > 0 },
        { key: 'drivers', done: drivers > 0 },
        { key: 'driverApp', done: driverApp > 0 },
        { key: 'expirations', done: expirations > 0 },
        { key: 'trip', done: trips > 0 },
        { key: 'tripFinished', done: tripsFinished > 0 },
        // Sale en el panel y en los comprobantes, pero sin logo se opera igual.
        { key: 'logo', done: !!company.logoUrl, optional: true },
      ],
    };
  }

  /** "Ocultar" desde el panel. No vuelve a aparecer. */
  async ocultar(companyId: string): Promise<void> {
    await this.companiesRepository.update(
      { id: companyId },
      { onboardingStep: 0 },
    );
  }
}
