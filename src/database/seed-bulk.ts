/* eslint-disable no-console */
/**
 * Seed MASIVO para FleetLog (base LOCAL de desarrollo).
 *
 * A diferencia de `seed.ts`, este script es ADITIVO y RE-EJECUTABLE: no borra
 * nada y no choca con datos existentes porque prefija todos los identificadores
 * únicos (patentes, emails, DNIs, códigos de viaje/incidente, clientId) con un
 * token único por corrida (timestamp en base36). Correlo las veces que quieras
 * para ir agrandando la flota.
 *
 * Uso:
 *   npm run seed:bulk
 *   BULK_TRUCKS=100 BULK_DRIVERS=80 npm run seed:bulk   # a medida
 *
 * Volúmenes por defecto (variables de entorno entre paréntesis):
 *   60 camiones (BULK_TRUCKS), 40 acoplados (BULK_TRAILERS),
 *   50 choferes (BULK_DRIVERS), 4 flotas nuevas (BULK_FLEETS),
 *   viajes: 15 en curso (BULK_INPROGRESS) + 60 finalizados (BULK_FINISHED)
 *          + 40 asignados (BULK_ASSIGNED) + 12 cancelados (BULK_CANCELED),
 *   cargas de combustible en 30 camiones (BULK_FUEL_TRUCKS) x 5,
 *   30 incidentes (BULK_INCIDENTS), 40 planillas OEA (BULK_OEA).
 *
 * NO usar en producción: crea usuarios con una contraseña conocida.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

import { DataSource } from 'typeorm';
import * as bcryptjs from 'bcryptjs';

import { User } from '../users/entities/user.entity';
import { Attachment } from '../common/attachments/entities/attachment.entity';
import { Fleet } from '../fleet/entities/fleet.entity';
import { Truck } from '../fleet/entities/truck.entity';
import { Trailer } from '../fleet/entities/trailer.entity';
import { Employee } from '../hr/entities/employee.entity';
import { Certification } from '../hr/entities/certification.entity';
import { TruckAssignment } from '../hr/entities/truck-assignment.entity';
import { EmploymentMovement } from '../hr/entities/employment-movement.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripLogEntry } from '../trip-log/entities/trip-log-entry.entity';
import { Settlement } from '../settlements/entities/settlement.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { ChecklistItem } from '../checklists/entities/checklist-item.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { IncidentEvent } from '../incidents/entities/incident-event.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { AlertRuleConfig } from '../alerts/entities/alert-rule-config.entity';
import { MaintenancePlan } from '../maintenance/entities/maintenance-plan.entity';
import { MaintenanceOrder } from '../maintenance/entities/maintenance-order.entity';
import { Document } from '../documents/entities/document.entity';
import { Message } from '../messages/entities/message.entity';
import { DeviceToken } from '../notifications/push/entities/device-token.entity';
import { FuelRecord } from '../fuel/entities/fuel-record.entity';
import { OeaInspection } from '../oea/entities/oea-inspection.entity';
import { OeaInspectionItem } from '../oea/entities/oea-inspection-item.entity';

import { Role } from '../common/enums/role.enum';
import { TruckStatus } from '../common/enums/truckStatus.enum';
import { TrailerStatus } from '../common/enums/trailerStatus.enum';
import { DriverStatus } from '../common/enums/driverStatus.enum';
import { EmploymentStatus } from '../common/enums/employmentStatus.enum';
import { EmployeePosition } from '../common/enums/employeePosition.enum';
import { CertificationType } from '../common/enums/certificationType.enum';
import { CertificationStatus } from '../common/enums/certificationStatus.enum';
import { TripStatus } from '../common/enums/tripStatus.enum';
import { TripLogType } from '../common/enums/tripLogType.enum';
import { SettlementStatus } from '../common/enums/settlementStatus.enum';
import {
  ChecklistItemStatus,
  ChecklistResult,
  DEFAULT_CHECKLIST_ITEMS,
} from '../common/enums/checklist.enum';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from '../common/enums/incident.enum';
import {
  AlertLevel,
  AlertSourceType,
  AlertStatus,
} from '../common/enums/alert.enum';
import {
  MaintenanceOrderStatus,
  MaintenancePlanStatus,
  MaintenanceTriggerType,
} from '../common/enums/maintenance.enum';
import {
  DocumentCategory,
  DocumentOwnerType,
  DocumentStatus,
} from '../common/enums/document.enum';
import { FuelType } from '../common/enums/fuel.enum';
import {
  DEFAULT_OEA_ITEMS,
  OeaItemStatus,
  OeaResult,
} from '../common/enums/oea.enum';

// ───────────────────────── Config ─────────────────────────
const N = {
  trucks: Number(process.env.BULK_TRUCKS) || 60,
  trailers: Number(process.env.BULK_TRAILERS) || 40,
  drivers: Number(process.env.BULK_DRIVERS) || 50,
  fleets: Number(process.env.BULK_FLEETS) || 4,
  inProgress: Number(process.env.BULK_INPROGRESS) || 15,
  finished: Number(process.env.BULK_FINISHED) || 60,
  assigned: Number(process.env.BULK_ASSIGNED) || 40,
  canceled: Number(process.env.BULK_CANCELED) || 12,
  fuelTrucks: Number(process.env.BULK_FUEL_TRUCKS) || 30,
  incidents: Number(process.env.BULK_INCIDENTS) || 30,
  oea: Number(process.env.BULK_OEA) || 40,
};

// Token único por corrida → garantiza unicidad de patentes/emails/códigos.
const TAG = Date.now().toString(36).toUpperCase();
const PASSWORD = 'Fleet1234!';

// ───────────────────────── Helpers ─────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const at = (days: number, hour = 9): Date => {
  const d = new Date(now + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const dateStr = (days: number): string => at(days).toISOString().slice(0, 10);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const sample = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const pad = (n: number, len = 4): string => String(n).padStart(len, '0');

const FIRST_NAMES = ['Carlos', 'Miguel', 'Raul', 'Andres', 'Fernando', 'Pablo', 'Juan', 'Diego', 'Martin', 'Sergio', 'Ruben', 'Hugo', 'Oscar', 'Daniel', 'Marcelo', 'Gustavo', 'Alberto', 'Roberto', 'Ramon', 'Cristian', 'Leonardo', 'Ezequiel', 'Matias', 'Nicolas', 'Facundo'];
const LAST_NAMES = ['Pereyra', 'Torres', 'Medina', 'Ledesma', 'Aguirre', 'Cabrera', 'Gomez', 'Fernandez', 'Rodriguez', 'Lopez', 'Diaz', 'Sosa', 'Romero', 'Benitez', 'Acosta', 'Molina', 'Silva', 'Rios', 'Vega', 'Herrera', 'Ferreyra', 'Ramos', 'Ortiz', 'Godoy', 'Ojeda'];
const BRANDS = [
  { brand: 'Scania', models: ['R450', 'G410', 'R500'] },
  { brand: 'Volvo', models: ['FH 460', 'FM 420', 'FH 500'] },
  { brand: 'Mercedes-Benz', models: ['Actros 2645', 'Axor 2536', 'Atego 1726'] },
  { brand: 'Iveco', models: ['Stralis 460', 'Tector 240', 'Hi-Way 480'] },
  { brand: 'Volkswagen', models: ['Constellation 24.280', 'Meteor 28.460'] },
  { brand: 'DAF', models: ['XF 480', 'CF 410'] },
  { brand: 'Ford', models: ['Cargo 1722', 'Cargo 2842'] },
];
const CITIES = ['Buenos Aires', 'Cordoba', 'Rosario', 'Mendoza', 'Tucuman', 'Salta', 'Neuquen', 'Bahia Blanca', 'Mar del Plata', 'Posadas', 'San Juan', 'Santa Fe', 'Resistencia', 'Comodoro Rivadavia', 'La Plata'];
const CARGOS = ['Alimentos secos', 'Bebidas', 'Materiales de construccion', 'Insumos petroleros', 'Repuestos', 'Electrodomesticos', 'Vino a granel', 'Papel', 'Granos', 'Contenedores', 'Productos quimicos', 'Carga refrigerada'];
const STATIONS = ['YPF Ruta 9', 'Shell Panamericana', 'Axion Autopista', 'Puma Ruta 7', 'YPF Ruta 3', 'Shell Ruta 34'];

async function run() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [
      User, Attachment, Fleet, Truck, Trailer, Employee, Certification,
      TruckAssignment, EmploymentMovement, Driver, Trip, TripLogEntry, Settlement, Checklist,
      ChecklistItem, Incident, IncidentEvent, Alert, AlertRuleConfig,
      MaintenancePlan, MaintenanceOrder, Document, Message, DeviceToken,
      FuelRecord, OeaInspection, OeaInspectionItem,
    ],
    synchronize: true,
  });

  await dataSource.initialize();
  console.log(`🔌 Conectado a ${process.env.DB_DATABASE}@${process.env.DB_HOST} (tag ${TAG})`);

  const passwordHash = await bcryptjs.hash(PASSWORD, 10);

  // ───────────────────────── Flotas (existentes + nuevas) ─────────────────────────
  const fleetRepo = dataSource.getRepository(Fleet);
  const existingFleets = await fleetRepo.find();
  const newFleets = await fleetRepo.save(
    Array.from({ length: N.fleets }, (_, i) => ({
      name: `Flota Regional ${TAG}-${i + 1}`,
      code: `FL-${TAG}-${i + 1}`,
      notes: 'Flota generada por seed masivo',
    })),
  );
  const fleets = [...existingFleets, ...newFleets];

  // ───────────────────────── Camiones ─────────────────────────
  const truckRepo = dataSource.getRepository(Truck);
  const trucks = await truckRepo.save(
    Array.from({ length: N.trucks }, (_, i) => {
      const b = sample(BRANDS);
      // Estados: primeros N.inProgress → ON_TRIP; algunos taller/detenido; resto disponible.
      let status = TruckStatus.AVAILABLE;
      if (i < N.inProgress) status = TruckStatus.ON_TRIP;
      else if (i % 17 === 0) status = TruckStatus.WORKSHOP;
      else if (i % 23 === 0) status = TruckStatus.STOPPED;
      return {
        plate: `BK${TAG}${pad(i)}`,
        internalNumber: `B${pad(i, 3)}`,
        brand: b.brand,
        model: sample(b.models),
        year: randInt(2015, 2024),
        type: i % 3 === 0 ? 'Chasis' : 'Tractor',
        loadCapacityKg: sample([10000, 14000, 28000, 30000, 32000]),
        currentOdometerKm: randInt(40000, 500000),
        engineHours: randInt(2000, 20000),
        status,
        fleetId: sample(fleets).id,
      };
    }),
  );

  // ───────────────────────── Acoplados ─────────────────────────
  const trailerRepo = dataSource.getRepository(Trailer);
  const trailerTypes = ['Semi lona', 'Semi furgon', 'Semi frigorifico', 'Batea', 'Portacontenedor'];
  const trailers = await trailerRepo.save(
    Array.from({ length: N.trailers }, (_, i) => ({
      plate: `BT${TAG}${pad(i)}`,
      type: sample(trailerTypes),
      loadCapacityKg: sample([26000, 28000, 30000, 32000]),
      status: i % 11 === 0 ? TrailerStatus.WORKSHOP : i < N.inProgress ? TrailerStatus.IN_USE : TrailerStatus.AVAILABLE,
    })),
  );

  // ───────────────────────── Choferes (User + Employee + Driver) ─────────────────────────
  const userRepo = dataSource.getRepository(User);
  const employeeRepo = dataSource.getRepository(Employee);
  const driverRepo = dataSource.getRepository(Driver);

  const users = await userRepo.save(
    Array.from({ length: N.drivers }, (_, i) => {
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = LAST_NAMES[(i * 7) % LAST_NAMES.length];
      return {
        email: `chofer.${TAG}.${i}@fleetlog.com`.toLowerCase(),
        name: `${first} ${last}`,
        password: passwordHash,
        phone: `+54 11 7${pad(i, 3)}-${pad(randInt(1000, 9999))}`,
        role: Role.DRIVER,
      };
    }),
  );

  const employees = await employeeRepo.save(
    users.map((u, i) => {
      const [first, last] = u.name.split(' ');
      return {
        userId: u.id,
        firstName: first,
        lastName: last,
        documentId: `${TAG}${pad(i, 5)}`,
        position: EmployeePosition.DRIVER,
        employmentStatus: i % 19 === 0 ? EmploymentStatus.ON_LEAVE : EmploymentStatus.ACTIVE,
        phone: u.phone,
        hireDate: dateStr(-randInt(60, 1800)),
        address: `Calle ${randInt(100, 9000)}, Argentina`,
      };
    }),
  );

  const drivers = await driverRepo.save(
    employees.map((e, i) => ({
      employeeId: e.id,
      licenseNumber: `LN-${TAG}-${pad(i)}`,
      licenseType: sample(['E1', 'E2', 'D1']),
      licenseExpiry: dateStr(randInt(-90, 720)),
      status: i < N.inProgress ? DriverStatus.ON_TRIP : (i % 19 === 0 ? DriverStatus.INACTIVE : DriverStatus.ACTIVE),
    })),
  );

  // ───────────────────────── Certificaciones ─────────────────────────
  const certRepo = dataSource.getRepository(Certification);
  const certs: Partial<Certification>[] = [];
  employees.forEach((e, i) => {
    const expDays = randInt(-60, 500);
    certs.push({
      employeeId: e.id,
      type: CertificationType.PROFESSIONAL_LICENSE,
      class: sample(['E1', 'E2']),
      number: `LNC-${TAG}-${i}`,
      issuedBy: 'CNRT',
      issueDate: dateStr(-randInt(400, 900)),
      expiryDate: dateStr(expDays),
      status: expDays < 0 ? CertificationStatus.EXPIRED : expDays < 30 ? CertificationStatus.EXPIRING : CertificationStatus.VALID,
    });
    certs.push({
      employeeId: e.id,
      type: CertificationType.MEDICAL_EXAM,
      number: `PSF-${TAG}-${i}`,
      issuedBy: 'Centro Medico Laboral',
      issueDate: dateStr(-randInt(100, 350)),
      expiryDate: dateStr(randInt(-30, 400)),
      status: CertificationStatus.VALID,
    });
  });
  await certRepo.save(certs);

  // ───────────────────────── Asignaciones camión↔chofer ─────────────────────────
  const assignRepo = dataSource.getRepository(TruckAssignment);
  await assignRepo.save(
    drivers.map((_, i) => ({
      employeeId: employees[i].id,
      truckId: trucks[i % trucks.length].id,
      assignedAt: at(-randInt(30, 400)),
      isPrimary: true,
      notes: 'Asignación principal (seed masivo)',
    })),
  );

  // ───────────────────────── Planes de mantenimiento ─────────────────────────
  const planRepo = dataSource.getRepository(MaintenancePlan);
  const orderRepo = dataSource.getRepository(MaintenanceOrder);
  await planRepo.save(
    trucks.map((t) => {
      const interval = sample([15000, 20000, 30000]);
      const lastKm = Math.max(0, t.currentOdometerKm - randInt(3000, interval));
      return {
        truckId: t.id,
        name: 'Service de aceite y filtros',
        triggerType: MaintenanceTriggerType.KM,
        intervalValue: interval,
        lastServiceKm: lastKm,
        lastServiceAt: dateStr(-randInt(30, 180)),
        nextDueKm: lastKm + interval,
        nextDueAt: dateStr(randInt(10, 180)),
        status: MaintenancePlanStatus.ACTIVE,
      };
    }),
  );
  // Órdenes de mantenimiento en camiones en taller + algunas hechas.
  const orders: Partial<MaintenanceOrder>[] = [];
  trucks.forEach((t) => {
    if (t.status === TruckStatus.WORKSHOP) {
      orders.push({ truckId: t.id, date: dateStr(-randInt(1, 5)), odometerKm: t.currentOdometerKm, description: 'Reparación en curso', items: [{ name: 'Mano de obra', cost: randInt(50000, 200000) }], cost: randInt(80000, 300000), status: MaintenanceOrderStatus.IN_PROGRESS });
    } else if (Math.random() < 0.25) {
      orders.push({ truckId: t.id, date: dateStr(-randInt(20, 120)), odometerKm: Math.max(0, t.currentOdometerKm - randInt(5000, 15000)), description: 'Service preventivo', items: [{ name: 'Aceite', cost: 45000 }, { name: 'Filtros', cost: 22000 }], cost: 67000, status: MaintenanceOrderStatus.DONE });
    }
  });
  await orderRepo.save(orders);

  // ───────────────────────── Viajes ─────────────────────────
  const tripRepo = dataSource.getRepository(Trip);
  const logRepo = dataSource.getRepository(TripLogEntry);
  const checklistRepo = dataSource.getRepository(Checklist);
  const checklistItemRepo = dataSource.getRepository(ChecklistItem);
  const settlementRepo = dataSource.getRepository(Settlement);
  const fuelRepo = dataSource.getRepository(FuelRecord);

  let tripSeq = 0;
  const tripRows: Partial<Trip>[] = [];
  const buildRoute = () => {
    const origin = sample(CITIES);
    let destination = sample(CITIES);
    while (destination === origin) destination = sample(CITIES);
    return { origin, destination, cargo: sample(CARGOS), km: randInt(150, 1400) };
  };

  // En curso: 1:1 con los primeros camiones/choferes ON_TRIP.
  for (let i = 0; i < N.inProgress; i++) {
    const r = buildRoute();
    const startOdo = trucks[i].currentOdometerKm - randInt(100, 400);
    tripRows.push({
      code: `VJ-${TAG}-${pad(tripSeq++)}`,
      truckId: trucks[i].id,
      trailerId: trailers[i % trailers.length].id,
      driverId: drivers[i].id,
      origin: r.origin, destination: r.destination, cargoDescription: r.cargo,
      plannedStartAt: at(-2, 6), plannedEndAt: at(1, 20),
      startedAt: at(-1, 7), startOdometerKm: startOdo,
      status: TripStatus.IN_PROGRESS,
    });
  }
  // Finalizados.
  for (let i = 0; i < N.finished; i++) {
    const r = buildRoute();
    const t = sample(trucks);
    const d = sample(drivers);
    const startOdo = randInt(50000, 480000);
    const day = -randInt(1, 120);
    tripRows.push({
      code: `VJ-${TAG}-${pad(tripSeq++)}`,
      truckId: t.id,
      trailerId: sample(trailers).id,
      driverId: d.id,
      origin: r.origin, destination: r.destination, cargoDescription: r.cargo,
      plannedStartAt: at(day, 6), plannedEndAt: at(day + 1, 22),
      startedAt: at(day, 6), finishedAt: at(day + 1, 20),
      startOdometerKm: startOdo, endOdometerKm: startOdo + r.km, distanceKm: r.km,
      status: TripStatus.FINISHED,
    });
  }
  // Asignados (aún sin arrancar).
  for (let i = 0; i < N.assigned; i++) {
    const r = buildRoute();
    tripRows.push({
      code: `VJ-${TAG}-${pad(tripSeq++)}`,
      truckId: sample(trucks).id,
      trailerId: sample(trailers).id,
      driverId: sample(drivers).id,
      origin: r.origin, destination: r.destination, cargoDescription: r.cargo,
      plannedStartAt: at(randInt(1, 15), 6), plannedEndAt: at(randInt(16, 20), 22),
      status: TripStatus.ASSIGNED,
    });
  }
  // Cancelados.
  for (let i = 0; i < N.canceled; i++) {
    const r = buildRoute();
    tripRows.push({
      code: `VJ-${TAG}-${pad(tripSeq++)}`,
      truckId: sample(trucks).id,
      trailerId: sample(trailers).id,
      driverId: sample(drivers).id,
      origin: r.origin, destination: r.destination, cargoDescription: r.cargo,
      plannedStartAt: at(-randInt(5, 40), 6),
      status: TripStatus.CANCELED, notes: 'Cancelado por cliente',
    });
  }
  const trips = await tripRepo.save(tripRows);

  // Bitácora + liquidación (finalizados) y checklist (arrancados).
  const startedTrips = trips.filter((t) => t.status === TripStatus.FINISHED || t.status === TripStatus.IN_PROGRESS);
  const finishedTrips = trips.filter((t) => t.status === TripStatus.FINISHED);

  const checklists = await checklistRepo.save(
    startedTrips.map((t) => ({
      tripId: t.id, truckId: t.truckId, driverId: t.driverId,
      result: ChecklistResult.APPROVED, signedAt: t.startedAt,
    })),
  );
  const checklistItems: Partial<ChecklistItem>[] = [];
  checklists.forEach((c) => {
    DEFAULT_CHECKLIST_ITEMS.forEach((it) => {
      checklistItems.push({ checklistId: c.id, key: it.key, label: it.label, status: ChecklistItemStatus.OK });
    });
  });
  await checklistItemRepo.save(checklistItems);

  const logs: Partial<TripLogEntry>[] = [];
  const settlements: Partial<Settlement>[] = [];
  finishedTrips.forEach((t) => {
    const km = t.distanceKm || 500;
    const fuel = round2(km * 0.35 * randInt(850, 950));
    const toll = randInt(8000, 25000);
    const perDiem = randInt(15000, 35000);
    const advance = randInt(20000, 60000);
    logs.push(
      { tripId: t.id, type: TripLogType.FUEL, amount: fuel, liters: round2(km * 0.35), odometerKm: (t.startOdometerKm || 0) + Math.round(km / 2), occurredAt: t.startedAt, notes: 'Carga en ruta' },
      { tripId: t.id, type: TripLogType.TOLL, amount: toll, occurredAt: t.startedAt },
      { tripId: t.id, type: TripLogType.PER_DIEM, amount: perDiem, occurredAt: t.startedAt },
      { tripId: t.id, type: TripLogType.CASH_ADVANCE, amount: advance, occurredAt: t.startedAt },
    );
    const totalExpenses = round2(fuel + toll + perDiem);
    settlements.push({
      tripId: t.id,
      totalsByType: { [TripLogType.FUEL]: fuel, [TripLogType.TOLL]: toll, [TripLogType.PER_DIEM]: perDiem, [TripLogType.CASH_ADVANCE]: advance },
      totalExpenses, totalAdvances: advance, netToSettle: round2(totalExpenses - advance),
      status: Math.random() < 0.3 ? SettlementStatus.CLOSED : SettlementStatus.DRAFT,
    });
  });
  await logRepo.save(logs);
  await settlementRepo.save(settlements);

  // ───────────────────────── Combustible (cadenas tanque-lleno) ─────────────────────────
  const fuelRows: Partial<FuelRecord>[] = [];
  const fuelTruckCount = Math.min(N.fuelTrucks, trucks.length);
  for (let t = 0; t < fuelTruckCount; t++) {
    const truck = trucks[t];
    const driver = drivers[t % drivers.length];
    let odo = Math.max(1000, truck.currentOdometerKm - 3500);
    for (let c = 0; c < 5; c++) {
      odo += randInt(450, 750);
      const liters = round2(randInt(150, 320));
      const price = round2(randInt(820, 980));
      fuelRows.push({
        truckId: truck.id, driverId: driver.id, fuelType: FuelType.DIESEL,
        liters, pricePerLiter: price, totalAmount: round2(liters * price),
        odometerKm: odo, fullTank: true, station: sample(STATIONS),
        occurredAt: at(-40 + c * 8), clientId: `bulk-${TAG}-fuel-${t}-${c}`,
      });
    }
  }
  await fuelRepo.save(fuelRows);

  // ───────────────────────── Incidentes ─────────────────────────
  const incidentRepo = dataSource.getRepository(Incident);
  const eventRepo = dataSource.getRepository(IncidentEvent);
  const incTypes = Object.values(IncidentType);
  const incSev = Object.values(IncidentSeverity);
  const incStatus = [IncidentStatus.PENDING, IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED];
  const dispatcher = await userRepo.findOne({ where: { role: Role.DISPATCHER } });
  const incidents = await incidentRepo.save(
    Array.from({ length: N.incidents }, (_, i) => {
      const status = sample(incStatus);
      return {
        code: `INC-${TAG}-${pad(i)}`,
        truckId: sample(trucks).id,
        driverId: sample(drivers).id,
        type: sample(incTypes),
        severity: sample(incSev),
        status,
        assignedToUserId: status !== IncidentStatus.PENDING ? dispatcher?.id : undefined,
        lat: round2(-34.6 - Math.random()),
        lng: round2(-58.4 - Math.random()),
        description: 'Incidente reportado en ruta (seed masivo).',
        resolvedAt: status === IncidentStatus.RESOLVED ? at(-randInt(1, 10)) : undefined,
      };
    }),
  );
  const events: Partial<IncidentEvent>[] = [];
  incidents.forEach((inc) => {
    events.push({ incidentId: inc.id, action: 'created', note: 'Reporte inicial.' });
    if (inc.status !== IncidentStatus.PENDING) events.push({ incidentId: inc.id, userId: dispatcher?.id, action: 'assigned', note: 'Asignado a despacho.' });
    if (inc.status === IncidentStatus.RESOLVED) events.push({ incidentId: inc.id, userId: dispatcher?.id, action: 'status_changed', note: 'Resuelto.' });
  });
  await eventRepo.save(events);

  // ───────────────────────── Documentos ─────────────────────────
  const docRepo = dataSource.getRepository(Document);
  const docs: Partial<Document>[] = [];
  trucks.forEach((t, i) => {
    const insExp = randInt(-30, 200);
    docs.push({ ownerType: DocumentOwnerType.TRUCK, ownerId: t.id, category: DocumentCategory.INSURANCE, number: `POL-${TAG}-${i}`, issueDate: dateStr(-200), expiryDate: dateStr(insExp), status: insExp < 0 ? DocumentStatus.EXPIRED : insExp < 30 ? DocumentStatus.EXPIRING : DocumentStatus.VALID });
    docs.push({ ownerType: DocumentOwnerType.TRUCK, ownerId: t.id, category: DocumentCategory.VTV, number: `VTV-${TAG}-${i}`, issueDate: dateStr(-150), expiryDate: dateStr(randInt(30, 300)), status: DocumentStatus.VALID });
  });
  drivers.forEach((d, i) => {
    const exp = randInt(-30, 400);
    docs.push({ ownerType: DocumentOwnerType.DRIVER, ownerId: d.id, category: DocumentCategory.LICENSE, number: d.licenseNumber, issueDate: dateStr(-400), expiryDate: dateStr(exp), status: exp < 0 ? DocumentStatus.EXPIRED : exp < 30 ? DocumentStatus.EXPIRING : DocumentStatus.VALID });
  });
  await docRepo.save(docs);

  // ───────────────────────── Planillas OEA ─────────────────────────
  const oeaRepo = dataSource.getRepository(OeaInspection);
  const oeaItemRepo = dataSource.getRepository(OeaInspectionItem);
  const oeaCount = Math.min(N.oea, N.finished + N.inProgress);
  const oeaInspections = await oeaRepo.save(
    Array.from({ length: oeaCount }, (_, i) => {
      const result = i % 7 === 0 ? OeaResult.NO_CONFORME : OeaResult.CONFORME;
      const r = buildRoute();
      return {
        truckId: sample(trucks).id,
        trailerId: sample(trailers).id,
        driverId: sample(drivers).id,
        origin: r.origin, destination: r.destination, cargoDescription: r.cargo,
        cargoWeightKg: randInt(15000, 30000),
        customsSealNumber: `AD-${TAG}-${i}`,
        securitySealNumber: `SG-${TAG}-${i}`,
        result,
        inspectedAt: at(-randInt(1, 30)),
        signedAt: at(-randInt(1, 30)),
        clientId: `bulk-${TAG}-oea-${i}`,
      };
    }),
  );
  const oeaItems: Partial<OeaInspectionItem>[] = [];
  oeaInspections.forEach((insp) => {
    DEFAULT_OEA_ITEMS.forEach((it, idx) => {
      const observed = insp.result === OeaResult.NO_CONFORME && idx === 8;
      oeaItems.push({ inspectionId: insp.id, key: it.key, section: it.section, label: it.label, status: observed ? OeaItemStatus.OBSERVED : OeaItemStatus.OK, notes: observed ? 'Precinto con signos de manipulación' : undefined });
    });
  });
  await oeaItemRepo.save(oeaItems);

  // ───────────────────────── Mensajes ─────────────────────────
  const messageRepo = dataSource.getRepository(Message);
  if (dispatcher) {
    const msgs: Partial<Message>[] = [];
    users.slice(0, Math.min(30, users.length)).forEach((u, i) => {
      msgs.push({ fromUserId: dispatcher.id, toUserId: u.id, body: '¿Cómo venís con el viaje? Avisá al llegar.', readAt: i % 2 === 0 ? at(-1, 12) : undefined });
      msgs.push({ fromUserId: u.id, toUserId: dispatcher.id, body: 'Todo en orden, llegando en unas horas.' });
    });
    await messageRepo.save(msgs);
  }

  // ───────────────────────── Alertas ─────────────────────────
  const alertRepo = dataSource.getRepository(Alert);
  const alertRows: Partial<Alert>[] = [];
  const levels = Object.values(AlertLevel);
  const sources = Object.values(AlertSourceType);
  for (let i = 0; i < 15; i++) {
    alertRows.push({
      level: sample(levels),
      sourceType: sample(sources),
      title: `Alerta de flota #${i + 1}`,
      message: 'Alerta generada por el seed masivo para pruebas.',
      status: sample([AlertStatus.NEW, AlertStatus.SEEN, AlertStatus.ACKNOWLEDGED]),
      targetRoles: [Role.DISPATCHER, Role.MANAGER],
    });
  }
  await alertRepo.save(alertRows);

  // ───────────────────────── Resumen ─────────────────────────
  const truckRepo2 = dataSource.getRepository(Truck);
  console.log('\n✅ Seed masivo completado. Totales ACUMULADOS en la base:');
  console.table({
    flotas: await fleetRepo.count(),
    camiones: await truckRepo2.count(),
    acoplados: await trailerRepo.count(),
    empleados: await employeeRepo.count(),
    usuarios: await userRepo.count(),
    choferes: await driverRepo.count(),
    viajes: await tripRepo.count(),
    combustible: await fuelRepo.count(),
    incidentes: await incidentRepo.count(),
    'órdenes mant.': await orderRepo.count(),
    documentos: await docRepo.count(),
    oea: await oeaRepo.count(),
    mensajes: await messageRepo.count(),
    alertas: await alertRepo.count(),
  });
  console.log(`\n➕ Agregado en esta corrida (tag ${TAG}): ${N.trucks} camiones, ${N.drivers} choferes, ${N.trailers} acoplados, ${trips.length} viajes.`);
  console.log(`🔑 Nuevos usuarios con contraseña: ${PASSWORD}  (emails: chofer.${TAG}.0..${N.drivers - 1}@fleetlog.com)`);

  await dataSource.destroy();
}

run().catch((err) => {
  console.error('❌ Error en el seed masivo:', err);
  process.exit(1);
});
