/* eslint-disable no-console */
/**
 * Seed de datos de prueba para FleetLog (base LOCAL de desarrollo).
 *
 * Llena la base con datos variados y coherentes para poder recorrer todo el
 * sistema: flotas, camiones, acoplados, empleados (RRHH) con sus usuarios y
 * choferes, certificaciones, asignaciones, viajes en distintos estados, gastos
 * de bitácora, cargas de combustible, incidentes, mantenimiento, documentos,
 * planillas OEA, checklists, liquidaciones, mensajes y alertas.
 *
 * Uso:
 *   npm run seed          → siembra si la base aún no fue sembrada
 *   SEED_FORCE=1 npm run seed  → siembra igual aunque ya existan datos
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
  ChecklistItemKey,
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

// ───────────────────────── Helpers ─────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** Fecha (objeto Date) a `n` días de hoy (n negativo = pasado). */
const at = (days: number, hour = 9): Date => {
  const d = new Date(now + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};
/** Fecha en formato 'YYYY-MM-DD' a `n` días de hoy. */
const dateStr = (days: number): string => at(days).toISOString().slice(0, 10);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];

const PASSWORD = 'Fleet1234!';
/** Contraseña simple para las cuentas demo (fácil de compartir con clientes). */
const DEMO_PASSWORD = 'demo1234';

async function run() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [
      User,
      Attachment,
      Fleet,
      Truck,
      Trailer,
      Employee,
      Certification,
      TruckAssignment,
      Driver,
      Trip,
      TripLogEntry,
      Settlement,
      Checklist,
      ChecklistItem,
      Incident,
      IncidentEvent,
      Alert,
      AlertRuleConfig,
      MaintenancePlan,
      MaintenanceOrder,
      Document,
      Message,
      DeviceToken,
      FuelRecord,
      OeaInspection,
      OeaInspectionItem,
    ],
    synchronize: true, // crea las tablas si no existen (base local)
  });

  await dataSource.initialize();
  console.log(`🔌 Conectado a ${process.env.DB_DATABASE}@${process.env.DB_HOST}`);

  const fleetRepo = dataSource.getRepository(Fleet);

  // Guard: no re-sembrar salvo SEED_FORCE.
  const already = await fleetRepo.findOne({ where: { code: 'FL-NORTE' } });
  if (already && !process.env.SEED_FORCE) {
    console.warn(
      '⚠️  La base ya parece tener datos de seed (flota FL-NORTE existe).\n' +
        '   Ejecutá con SEED_FORCE=1 para sembrar igual, o vaciá la base primero.',
    );
    await dataSource.destroy();
    return;
  }

  const passwordHash = await bcryptjs.hash(PASSWORD, 10);

  // ───────────────────────── Flotas ─────────────────────────
  const fleets = await fleetRepo.save([
    { name: 'Flota Norte', code: 'FL-NORTE', notes: 'Larga distancia NOA/NEA' },
    { name: 'Flota Sur', code: 'FL-SUR', notes: 'Patagonia y sur bonaerense' },
    { name: 'Flota Cuyo', code: 'FL-CUYO', notes: 'Mendoza / San Juan' },
  ]);

  // ───────────────────────── Camiones ─────────────────────────
  const truckRepo = dataSource.getRepository(Truck);
  const truckSeed = [
    { plate: 'AB123CD', internalNumber: '01', brand: 'Scania', model: 'R450', year: 2021, type: 'Tractor', loadCapacityKg: 30000, currentOdometerKm: 185000, status: TruckStatus.AVAILABLE },
    { plate: 'AC234DE', internalNumber: '02', brand: 'Volvo', model: 'FH 460', year: 2020, type: 'Tractor', loadCapacityKg: 30000, currentOdometerKm: 240500, status: TruckStatus.AVAILABLE },
    { plate: 'AD345EF', internalNumber: '03', brand: 'Mercedes-Benz', model: 'Actros 2645', year: 2019, type: 'Tractor', loadCapacityKg: 28000, currentOdometerKm: 312000, status: TruckStatus.ON_TRIP },
    { plate: 'AE456FG', internalNumber: '04', brand: 'Iveco', model: 'Stralis 460', year: 2022, type: 'Tractor', loadCapacityKg: 30000, currentOdometerKm: 96000, status: TruckStatus.ON_TRIP },
    { plate: 'AF567GH', internalNumber: '05', brand: 'Scania', model: 'G410', year: 2018, type: 'Chasis', loadCapacityKg: 15000, currentOdometerKm: 420000, status: TruckStatus.WORKSHOP },
    { plate: 'AG678HI', internalNumber: '06', brand: 'Volkswagen', model: 'Constellation 24.280', year: 2020, type: 'Chasis', loadCapacityKg: 14000, currentOdometerKm: 158000, status: TruckStatus.AVAILABLE },
    { plate: 'AH789IJ', internalNumber: '07', brand: 'Ford', model: 'Cargo 1722', year: 2017, type: 'Chasis', loadCapacityKg: 10000, currentOdometerKm: 275000, status: TruckStatus.STOPPED },
    { plate: 'AI890JK', internalNumber: '08', brand: 'DAF', model: 'XF 480', year: 2023, type: 'Tractor', loadCapacityKg: 32000, currentOdometerKm: 41000, status: TruckStatus.AVAILABLE },
  ];
  const trucks = await truckRepo.save(
    truckSeed.map((t, i) => ({ ...t, fleetId: pick(fleets, i).id })),
  );

  // ───────────────────────── Acoplados ─────────────────────────
  const trailerRepo = dataSource.getRepository(Trailer);
  const trailers = await trailerRepo.save([
    { plate: 'ZAA100', type: 'Semi lona', loadCapacityKg: 30000, status: TrailerStatus.AVAILABLE },
    { plate: 'ZAA200', type: 'Semi furgón', loadCapacityKg: 28000, status: TrailerStatus.IN_USE },
    { plate: 'ZAA300', type: 'Semi frigorífico', loadCapacityKg: 26000, status: TrailerStatus.IN_USE },
    { plate: 'ZAA400', type: 'Batea', loadCapacityKg: 32000, status: TrailerStatus.AVAILABLE },
    { plate: 'ZAA500', type: 'Semi lona', loadCapacityKg: 30000, status: TrailerStatus.WORKSHOP },
    { plate: 'ZAA600', type: 'Portacontenedor', loadCapacityKg: 30000, status: TrailerStatus.AVAILABLE },
  ]);

  // ───────────────────────── Empleados + Usuarios ─────────────────────────
  const userRepo = dataSource.getRepository(User);
  const employeeRepo = dataSource.getRepository(Employee);

  /** Crea (o reutiliza) un User y su Employee vinculado. */
  const createEmployee = async (data: {
    firstName: string;
    lastName: string;
    documentId: string;
    position: EmployeePosition;
    role: Role;
    phone: string;
    email: string;
    hireDays: number;
    isDemo?: boolean;
    password?: string;
  }): Promise<Employee> => {
    let user = await userRepo.findOne({ where: { email: data.email } });
    if (!user) {
      user = await userRepo.save({
        email: data.email,
        name: `${data.firstName} ${data.lastName}`,
        password: data.password
          ? await bcryptjs.hash(data.password, 10)
          : passwordHash,
        phone: data.phone,
        role: data.role,
        isDemo: data.isDemo ?? false,
      });
    }
    return employeeRepo.save({
      userId: user.id,
      firstName: data.firstName,
      lastName: data.lastName,
      documentId: data.documentId,
      position: data.position,
      employmentStatus: EmploymentStatus.ACTIVE,
      phone: data.phone,
      hireDate: dateStr(data.hireDays),
      address: 'Av. Siempreviva 742, Argentina',
      emergencyContactName: 'Contacto de emergencia',
      emergencyContactPhone: '+54 11 5555-0000',
    });
  };

  // Staff (no choferes)
  await createEmployee({ firstName: 'Laura', lastName: 'Gómez', documentId: '20111222', position: EmployeePosition.MANAGER, role: Role.MANAGER, phone: '+54 11 4000-0001', email: 'laura.gomez@fleetlog.com', hireDays: -1200 });
  const dispatcher = await createEmployee({ firstName: 'Diego', lastName: 'Fernández', documentId: '22333444', position: EmployeePosition.DISPATCHER, role: Role.DISPATCHER, phone: '+54 11 4000-0002', email: 'diego.fernandez@fleetlog.com', hireDays: -900 });
  await createEmployee({ firstName: 'Sofía', lastName: 'Ramírez', documentId: '25444555', position: EmployeePosition.OTHER, role: Role.HR, phone: '+54 11 4000-0003', email: 'sofia.ramirez@fleetlog.com', hireDays: -800 });
  await createEmployee({ firstName: 'Jorge', lastName: 'Sosa', documentId: '27555666', position: EmployeePosition.MECHANIC, role: Role.MAINTENANCE, phone: '+54 11 4000-0004', email: 'jorge.sosa@fleetlog.com', hireDays: -700 });
  await createEmployee({ firstName: 'Marta', lastName: 'Ríos', documentId: '28666777', position: EmployeePosition.OTHER, role: Role.AUDITOR, phone: '+54 11 4000-0005', email: 'marta.rios@fleetlog.com', hireDays: -600 });
  await createEmployee({ firstName: 'Administrador', lastName: 'General', documentId: '10000001', position: EmployeePosition.ADMIN, role: Role.ADMIN, phone: '+54 11 4000-0000', email: 'admin@fleetlog.com', hireDays: -1500 });

  const dispatcherUserId = dispatcher.userId;

  // Choferes: Employee + User + Driver
  const driverRepo = dataSource.getRepository(Driver);
  const driverSeed = [
    { firstName: 'Carlos', lastName: 'Pereyra', email: 'carlos.pereyra@fleetlog.com', documentId: '30111000', phone: '+54 11 6000-0001', license: 'B-30111000', licenseType: 'E1' },
    { firstName: 'Miguel', lastName: 'Torres', email: 'miguel.torres@fleetlog.com', documentId: '30222000', phone: '+54 11 6000-0002', license: 'B-30222000', licenseType: 'E1' },
    { firstName: 'Raúl', lastName: 'Medina', email: 'raul.medina@fleetlog.com', documentId: '30333000', phone: '+54 11 6000-0003', license: 'B-30333000', licenseType: 'E2' },
    { firstName: 'Andrés', lastName: 'Ledesma', email: 'andres.ledesma@fleetlog.com', documentId: '30444000', phone: '+54 11 6000-0004', license: 'B-30444000', licenseType: 'E1' },
    { firstName: 'Fernando', lastName: 'Aguirre', email: 'fernando.aguirre@fleetlog.com', documentId: '30555000', phone: '+54 11 6000-0005', license: 'B-30555000', licenseType: 'D1' },
    { firstName: 'Pablo', lastName: 'Cabrera', email: 'pablo.cabrera@fleetlog.com', documentId: '30666000', phone: '+54 11 6000-0006', license: 'B-30666000', licenseType: 'E2' },
  ];
  const drivers: Driver[] = [];
  const driverEmployees: Employee[] = [];
  for (let i = 0; i < driverSeed.length; i++) {
    const s = driverSeed[i];
    const emp = await createEmployee({
      firstName: s.firstName,
      lastName: s.lastName,
      documentId: s.documentId,
      position: EmployeePosition.DRIVER,
      role: Role.DRIVER,
      phone: s.phone,
      email: s.email,
      hireDays: -500 + i * 40,
    });
    driverEmployees.push(emp);
    // Camiones 03 y 04 están ON_TRIP → sus choferes ON_TRIP
    const status =
      i === 2 || i === 3 ? DriverStatus.ON_TRIP : DriverStatus.ACTIVE;
    const driver = await driverRepo.save({
      employeeId: emp.id,
      licenseNumber: s.license,
      licenseType: s.licenseType,
      licenseExpiry: dateStr(180 - i * 60), // algunos por vencer
      status,
    });
    drivers.push(driver);
  }

  // ───────────────────────── Certificaciones ─────────────────────────
  const certRepo = dataSource.getRepository(Certification);
  for (let i = 0; i < driverEmployees.length; i++) {
    const emp = driverEmployees[i];
    await certRepo.save([
      {
        employeeId: emp.id,
        type: CertificationType.PROFESSIONAL_LICENSE,
        class: 'E1',
        number: `LNC-${emp.documentId}`,
        issuedBy: 'CNRT',
        issueDate: dateStr(-700),
        expiryDate: dateStr(120 - i * 50),
        status:
          i >= 4 ? CertificationStatus.EXPIRED : CertificationStatus.VALID,
      },
      {
        employeeId: emp.id,
        type: CertificationType.MEDICAL_EXAM,
        number: `PSF-${emp.documentId}`,
        issuedBy: 'Centro Médico Laboral',
        issueDate: dateStr(-350),
        expiryDate: dateStr(15 + i * 20), // algunas por vencer pronto
        status:
          i === 0 ? CertificationStatus.EXPIRING : CertificationStatus.VALID,
      },
    ]);
  }

  // ───────────────────────── Asignaciones camión↔chofer ─────────────────────────
  const assignRepo = dataSource.getRepository(TruckAssignment);
  for (let i = 0; i < driverEmployees.length; i++) {
    await assignRepo.save({
      employeeId: driverEmployees[i].id,
      truckId: pick(trucks, i).id,
      assignedAt: at(-300 + i * 10),
      isPrimary: true,
      notes: 'Asignación principal',
    });
  }
  // Una asignación histórica (finalizada)
  await assignRepo.save({
    employeeId: driverEmployees[0].id,
    truckId: trucks[6].id,
    assignedAt: at(-500),
    unassignedAt: at(-320),
    isPrimary: false,
    notes: 'Asignación anterior',
  });

  // ───────────────────────── Viajes ─────────────────────────
  const tripRepo = dataSource.getRepository(Trip);
  const logRepo = dataSource.getRepository(TripLogEntry);
  const checklistRepo = dataSource.getRepository(Checklist);
  const checklistItemRepo = dataSource.getRepository(ChecklistItem);
  const settlementRepo = dataSource.getRepository(Settlement);

  const routes = [
    { origin: 'Buenos Aires', destination: 'Córdoba', cargo: 'Alimentos secos', km: 700 },
    { origin: 'Rosario', destination: 'Mendoza', cargo: 'Bebidas', km: 950 },
    { origin: 'Buenos Aires', destination: 'Tucumán', cargo: 'Materiales de construcción', km: 1250 },
    { origin: 'Bahía Blanca', destination: 'Neuquén', cargo: 'Insumos petroleros', km: 640 },
    { origin: 'Córdoba', destination: 'Salta', cargo: 'Repuestos', km: 900 },
    { origin: 'Buenos Aires', destination: 'Mar del Plata', cargo: 'Electrodomésticos', km: 400 },
    { origin: 'Mendoza', destination: 'San Juan', cargo: 'Vino a granel', km: 170 },
    { origin: 'Buenos Aires', destination: 'Posadas', cargo: 'Papel', km: 1000 },
  ];

  // status por índice: 0-2 finished, 3-4 in_progress, 5-6 assigned, 7 canceled
  const tripStatusByIndex = [
    TripStatus.FINISHED,
    TripStatus.FINISHED,
    TripStatus.FINISHED,
    TripStatus.IN_PROGRESS,
    TripStatus.IN_PROGRESS,
    TripStatus.ASSIGNED,
    TripStatus.ASSIGNED,
    TripStatus.CANCELED,
  ];

  const finishedTrips: Trip[] = [];
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    const status = tripStatusByIndex[i];
    // choferes 03/04 (idx 2,3) están de viaje → los mapeo a in_progress
    const truck =
      status === TripStatus.IN_PROGRESS ? trucks[2 + (i - 3)] : pick(trucks, i);
    const driver =
      status === TripStatus.IN_PROGRESS ? drivers[2 + (i - 3)] : pick(drivers, i);
    const startOdo = 100000 + i * 5000;

    let startedAt: Date | undefined;
    let finishedAt: Date | undefined;
    let endOdo: number | undefined;
    let distanceKm: number | undefined;

    if (status === TripStatus.FINISHED) {
      startedAt = at(-20 + i * 3, 6);
      finishedAt = at(-20 + i * 3 + 1, 20);
      endOdo = startOdo + r.km;
      distanceKm = r.km;
    } else if (status === TripStatus.IN_PROGRESS) {
      startedAt = at(-1, 7);
    }

    const trip = await tripRepo.save({
      code: `VJ-${String(1000 + i)}`,
      truckId: truck.id,
      trailerId: pick(trailers, i).id,
      driverId: driver.id,
      origin: r.origin,
      destination: r.destination,
      cargoDescription: r.cargo,
      plannedStartAt: at(-20 + i * 3, 6),
      plannedEndAt: at(-20 + i * 3 + 1, 22),
      startedAt,
      finishedAt,
      startOdometerKm:
        status === TripStatus.ASSIGNED ? undefined : startOdo,
      endOdometerKm: endOdo,
      distanceKm,
      status,
      notes: status === TripStatus.CANCELED ? 'Cancelado por cliente' : undefined,
    });

    // Checklist para viajes que arrancaron
    if (status === TripStatus.FINISHED || status === TripStatus.IN_PROGRESS) {
      const checklist = await checklistRepo.save({
        tripId: trip.id,
        truckId: truck.id,
        driverId: driver.id,
        result: ChecklistResult.APPROVED,
        signedAt: startedAt,
      });
      await checklistItemRepo.save(
        DEFAULT_CHECKLIST_ITEMS.map((it) => ({
          checklistId: checklist.id,
          key: it.key,
          label: it.label,
          status: ChecklistItemStatus.OK,
        })),
      );
    }

    // Bitácora + liquidación para finalizados
    if (status === TripStatus.FINISHED) {
      finishedTrips.push(trip);
      const fuelAmount = round2(r.km * 0.35 * 900); // ~litros * precio
      const toll = 12000 + i * 1500;
      const perDiem = 25000;
      const advance = 40000;
      await logRepo.save([
        { tripId: trip.id, type: TripLogType.FUEL, amount: fuelAmount, liters: round2(r.km * 0.35), odometerKm: startOdo + Math.round(r.km / 2), occurredAt: at(-20 + i * 3, 12), notes: 'Carga en ruta' },
        { tripId: trip.id, type: TripLogType.TOLL, amount: toll, occurredAt: at(-20 + i * 3, 10), notes: 'Peajes' },
        { tripId: trip.id, type: TripLogType.PER_DIEM, amount: perDiem, occurredAt: at(-20 + i * 3, 8), notes: 'Viáticos' },
        { tripId: trip.id, type: TripLogType.CASH_ADVANCE, amount: advance, occurredAt: at(-20 + i * 3, 7), notes: 'Adelanto en efectivo' },
      ]);

      const totalsByType = {
        [TripLogType.FUEL]: fuelAmount,
        [TripLogType.TOLL]: toll,
        [TripLogType.PER_DIEM]: perDiem,
        [TripLogType.CASH_ADVANCE]: advance,
      };
      const totalExpenses = round2(fuelAmount + toll + perDiem);
      const totalAdvances = advance;
      await settlementRepo.save({
        tripId: trip.id,
        totalsByType,
        totalExpenses,
        totalAdvances,
        netToSettle: round2(totalExpenses - totalAdvances),
        status: i === 0 ? SettlementStatus.CLOSED : SettlementStatus.DRAFT,
      });
    }
  }

  // ───────────────────────── Combustible ─────────────────────────
  // Cadena de cargas tanque-lleno por camión (odómetro creciente) para reportes.
  const fuelRepo = dataSource.getRepository(FuelRecord);
  const stations = ['YPF Ruta 9', 'Shell Panamericana', 'Axion Autopista', 'Puma Ruta 7'];
  for (let t = 0; t < 4; t++) {
    const truck = trucks[t];
    const driver = drivers[t];
    let odo = truck.currentOdometerKm - 3000;
    for (let c = 0; c < 5; c++) {
      odo += 550 + t * 20 + c * 15;
      const liters = round2(180 + c * 5 + t * 3);
      const price = round2(880 + c * 12);
      await fuelRepo.save({
        truckId: truck.id,
        driverId: driver.id,
        fuelType: FuelType.DIESEL,
        liters,
        pricePerLiter: price,
        totalAmount: round2(liters * price),
        odometerKm: odo,
        fullTank: true,
        station: pick(stations, c),
        occurredAt: at(-40 + c * 8),
        clientId: `seed-fuel-${t}-${c}`,
      });
    }
  }

  // ───────────────────────── Incidentes ─────────────────────────
  const incidentRepo = dataSource.getRepository(Incident);
  const eventRepo = dataSource.getRepository(IncidentEvent);
  const incidentSeed = [
    { type: IncidentType.MECHANICAL, severity: IncidentSeverity.HIGH, status: IncidentStatus.IN_PROGRESS, desc: 'Pérdida de presión de aceite en ruta.' },
    { type: IncidentType.ACCIDENT, severity: IncidentSeverity.CRITICAL, status: IncidentStatus.RESOLVED, desc: 'Roce con guardarraíl, sin heridos.' },
    { type: IncidentType.DELAY, severity: IncidentSeverity.LOW, status: IncidentStatus.RESOLVED, desc: 'Demora por corte de ruta.' },
    { type: IncidentType.CARGO_ISSUE, severity: IncidentSeverity.MEDIUM, status: IncidentStatus.PENDING, desc: 'Faltante detectado al descargar.' },
    { type: IncidentType.EMERGENCY, severity: IncidentSeverity.CRITICAL, status: IncidentStatus.PENDING, desc: 'Descompostura del chofer, requiere relevo.' },
  ];
  for (let i = 0; i < incidentSeed.length; i++) {
    const s = incidentSeed[i];
    const incident = await incidentRepo.save({
      code: `INC-${String(2000 + i)}`,
      truckId: pick(trucks, i).id,
      driverId: pick(drivers, i).id,
      type: s.type,
      severity: s.severity,
      status: s.status,
      assignedToUserId: s.status !== IncidentStatus.PENDING ? dispatcherUserId : undefined,
      lat: round2(-34.6 - i * 0.1),
      lng: round2(-58.4 - i * 0.1),
      description: s.desc,
      resolvedAt: s.status === IncidentStatus.RESOLVED ? at(-2 + i) : undefined,
    });
    await eventRepo.save({ incidentId: incident.id, action: 'created', note: 'Reporte inicial del chofer.' });
    if (s.status !== IncidentStatus.PENDING) {
      await eventRepo.save({ incidentId: incident.id, userId: dispatcherUserId, action: 'assigned', note: 'Asignado a despacho.' });
    }
    if (s.status === IncidentStatus.RESOLVED) {
      await eventRepo.save({ incidentId: incident.id, userId: dispatcherUserId, action: 'status_changed', note: 'Incidente resuelto.' });
    }
  }

  // ───────────────────────── Mantenimiento ─────────────────────────
  const planRepo = dataSource.getRepository(MaintenancePlan);
  const orderRepo = dataSource.getRepository(MaintenanceOrder);
  for (let i = 0; i < trucks.length; i++) {
    const truck = trucks[i];
    const interval = 20000;
    const lastServiceKm = truck.currentOdometerKm - 12000;
    await planRepo.save({
      truckId: truck.id,
      name: 'Service de aceite y filtros',
      triggerType: MaintenanceTriggerType.KM,
      intervalValue: interval,
      lastServiceKm,
      lastServiceAt: dateStr(-90),
      nextDueKm: lastServiceKm + interval,
      nextDueAt: dateStr(90),
      status: MaintenancePlanStatus.ACTIVE,
    });
  }
  // Órdenes: 2 hechas, 1 abierta (camión 05 en taller)
  await orderRepo.save([
    { truckId: trucks[0].id, date: dateStr(-90), odometerKm: trucks[0].currentOdometerKm - 12000, description: 'Cambio de aceite y filtros', items: [{ name: 'Aceite 15W40', cost: 45000 }, { name: 'Filtros', cost: 22000 }], cost: 67000, status: MaintenanceOrderStatus.DONE },
    { truckId: trucks[1].id, date: dateStr(-45), odometerKm: trucks[1].currentOdometerKm - 8000, description: 'Cambio de cubiertas', items: [{ name: 'Cubiertas x2', cost: 380000 }], cost: 380000, status: MaintenanceOrderStatus.DONE },
    { truckId: trucks[4].id, date: dateStr(-2), odometerKm: trucks[4].currentOdometerKm, description: 'Reparación de sistema de frenos', items: [{ name: 'Pastillas', cost: 60000 }, { name: 'Mano de obra', cost: 90000 }], cost: 150000, status: MaintenanceOrderStatus.IN_PROGRESS, notes: 'Camión inmovilizado en taller' },
  ]);

  // ───────────────────────── Documentos ─────────────────────────
  const docRepo = dataSource.getRepository(Document);
  const docs: Partial<Document>[] = [];
  for (let i = 0; i < trucks.length; i++) {
    docs.push(
      { ownerType: DocumentOwnerType.TRUCK, ownerId: trucks[i].id, category: DocumentCategory.INSURANCE, number: `POL-${1000 + i}`, issueDate: dateStr(-200), expiryDate: dateStr(60 - i * 20), status: i >= 6 ? DocumentStatus.EXPIRED : DocumentStatus.VALID },
      { ownerType: DocumentOwnerType.TRUCK, ownerId: trucks[i].id, category: DocumentCategory.VTV, number: `VTV-${1000 + i}`, issueDate: dateStr(-150), expiryDate: dateStr(200 - i * 15), status: DocumentStatus.VALID },
    );
  }
  for (let i = 0; i < trailers.length; i++) {
    docs.push({ ownerType: DocumentOwnerType.TRAILER, ownerId: trailers[i].id, category: DocumentCategory.INSURANCE, number: `POL-AC-${100 + i}`, issueDate: dateStr(-180), expiryDate: dateStr(90 - i * 30), status: DocumentStatus.VALID });
  }
  for (let i = 0; i < drivers.length; i++) {
    docs.push({ ownerType: DocumentOwnerType.DRIVER, ownerId: drivers[i].id, category: DocumentCategory.LICENSE, number: driverSeed[i].license, issueDate: dateStr(-400), expiryDate: dateStr(180 - i * 60), status: i >= 4 ? DocumentStatus.EXPIRING : DocumentStatus.VALID });
  }
  docs.push(
    { ownerType: DocumentOwnerType.COMPANY, category: DocumentCategory.PERMIT, number: 'CNRT-2026', issueDate: dateStr(-300), expiryDate: dateStr(300), status: DocumentStatus.VALID },
    { ownerType: DocumentOwnerType.COMPANY, category: DocumentCategory.PERMIT, number: 'SENASA-2026', issueDate: dateStr(-100), expiryDate: dateStr(25), status: DocumentStatus.EXPIRING },
  );
  await docRepo.save(docs);

  // ───────────────────────── Planillas OEA ─────────────────────────
  const oeaRepo = dataSource.getRepository(OeaInspection);
  const oeaItemRepo = dataSource.getRepository(OeaInspectionItem);
  for (let i = 0; i < 4; i++) {
    const result = i === 3 ? OeaResult.NO_CONFORME : OeaResult.CONFORME;
    const inspection = await oeaRepo.save({
      truckId: pick(trucks, i).id,
      trailerId: pick(trailers, i).id,
      driverId: pick(drivers, i).id,
      tripNumber: `VJ-${1000 + i}`,
      origin: pick(routes, i).origin,
      destination: pick(routes, i).destination,
      cargoDescription: pick(routes, i).cargo,
      cargoWeightKg: 24000,
      customsSealNumber: `AD-${50000 + i}`,
      securitySealNumber: `SG-${70000 + i}`,
      driverDocument: driverSeed[i].documentId,
      driverLicense: driverSeed[i].license,
      result,
      inspectedAt: at(-10 + i),
      signedAt: at(-10 + i),
      clientId: `seed-oea-${i}`,
    });
    await oeaItemRepo.save(
      DEFAULT_OEA_ITEMS.map((it, idx) => ({
        inspectionId: inspection.id,
        key: it.key,
        section: it.section,
        label: it.label,
        status:
          result === OeaResult.NO_CONFORME && idx === 8
            ? OeaItemStatus.OBSERVED
            : OeaItemStatus.OK,
        notes:
          result === OeaResult.NO_CONFORME && idx === 8
            ? 'Precinto de seguridad con signos de manipulación'
            : undefined,
      })),
    );
  }

  // ───────────────────────── Mensajes ─────────────────────────
  const messageRepo = dataSource.getRepository(Message);
  const driverUserIds = driverEmployees.map((e) => e.userId);
  const msgs: Partial<Message>[] = [];
  for (let i = 0; i < driverUserIds.length; i++) {
    msgs.push(
      { fromUserId: dispatcherUserId, toUserId: driverUserIds[i], body: '¿Cómo venís con el viaje? Avisá al llegar.', readAt: i % 2 === 0 ? at(-1, 12) : undefined },
      { fromUserId: driverUserIds[i], toUserId: dispatcherUserId, body: 'Todo en orden, llegando en unas horas.', readAt: undefined },
    );
  }
  await messageRepo.save(msgs);

  // ───────────────────────── Alertas ─────────────────────────
  const alertRepo = dataSource.getRepository(Alert);
  await alertRepo.save([
    { level: AlertLevel.RED, sourceType: AlertSourceType.INCIDENT, sourceId: 'INC-2004', title: 'Emergencia: chofer descompuesto', message: 'Se requiere relevo urgente para el viaje en curso.', status: AlertStatus.NEW, targetRoles: [Role.DISPATCHER, Role.MANAGER] },
    { level: AlertLevel.ORANGE, sourceType: AlertSourceType.MAINTENANCE, title: 'Service próximo', message: 'El camión AF567GH está próximo a su service por km.', status: AlertStatus.SEEN, targetRoles: [Role.MAINTENANCE] },
    { level: AlertLevel.YELLOW, sourceType: AlertSourceType.EXPENSE, title: 'Gasto elevado', message: 'Carga de combustible por encima del umbral en VJ-1002.', status: AlertStatus.NEW, targetRoles: [Role.MANAGER] },
    { level: AlertLevel.YELLOW, sourceType: AlertSourceType.CERTIFICATION, title: 'Psicofísico por vencer', message: 'Carlos Pereyra tiene el psicofísico próximo a vencer.', status: AlertStatus.ACKNOWLEDGED, targetRoles: [Role.HR] },
    { level: AlertLevel.GREEN, sourceType: AlertSourceType.DOCUMENT, title: 'Documento próximo a vencer', message: 'Permiso SENASA-2026 vence en 25 días.', status: AlertStatus.NEW, targetRoles: [Role.ADMIN] },
    { level: AlertLevel.RED, sourceType: AlertSourceType.TRUCK_IDLE, title: 'Camión detenido', message: 'El camión AH789IJ figura detenido sin actividad.', status: AlertStatus.NEW, targetRoles: [Role.DISPATCHER] },
  ]);

  // ───────────────────── Usuarios DEMO (solo lectura) ─────────────────────
  // Cuentas para mostrar el sistema a clientes: ven todo y descargan PDFs, pero el
  // DemoReadOnlyGuard les bloquea cualquier escritura (User.isDemo = true).

  // Demo admin: recorre todo el backoffice con los datos ya sembrados.
  await createEmployee({
    firstName: 'Demo',
    lastName: 'Admin',
    documentId: '99000001',
    position: EmployeePosition.ADMIN,
    role: Role.ADMIN,
    phone: '+54 11 4000-9001',
    email: 'demo.admin@fleetlog.com',
    hireDays: -365,
    isDemo: true,
    password: DEMO_PASSWORD,
  });

  // Demo chofer: Employee + User(demo) + Driver, con asignación, viaje en curso y
  // viaje finalizado (bitácora + liquidación) para que la app del chofer no salga vacía.
  const demoEmp = await createEmployee({
    firstName: 'Demo',
    lastName: 'Chofer',
    documentId: '99000002',
    position: EmployeePosition.DRIVER,
    role: Role.DRIVER,
    phone: '+54 11 6000-9002',
    email: 'demo.chofer@fleetlog.com',
    hireDays: -300,
    isDemo: true,
    password: DEMO_PASSWORD,
  });
  const demoTruck = trucks[7]; // AI890JK
  const demoDriver = await driverRepo.save({
    employeeId: demoEmp.id,
    licenseNumber: 'B-99000002',
    licenseType: 'E1',
    licenseExpiry: dateStr(200),
    status: DriverStatus.ON_TRIP,
  });
  await certRepo.save({
    employeeId: demoEmp.id,
    type: CertificationType.PROFESSIONAL_LICENSE,
    class: 'E1',
    number: `LNC-${demoEmp.documentId}`,
    issuedBy: 'CNRT',
    issueDate: dateStr(-300),
    expiryDate: dateStr(200),
    status: CertificationStatus.VALID,
  });
  await assignRepo.save({
    employeeId: demoEmp.id,
    truckId: demoTruck.id,
    assignedAt: at(-100),
    isPrimary: true,
    notes: 'Asignación demo',
  });

  // Viaje en curso (con checklist aprobado).
  const demoInProgress = await tripRepo.save({
    code: 'VJ-DEMO1',
    truckId: demoTruck.id,
    trailerId: trailers[0].id,
    driverId: demoDriver.id,
    origin: 'Buenos Aires',
    destination: 'Rosario',
    cargoDescription: 'Carga general (demo)',
    plannedStartAt: at(-1, 6),
    plannedEndAt: at(0, 20),
    startedAt: at(-1, 7),
    startOdometerKm: demoTruck.currentOdometerKm,
    status: TripStatus.IN_PROGRESS,
  });
  const demoChecklist = await checklistRepo.save({
    tripId: demoInProgress.id,
    truckId: demoTruck.id,
    driverId: demoDriver.id,
    result: ChecklistResult.APPROVED,
    signedAt: at(-1, 7),
  });
  await checklistItemRepo.save(
    DEFAULT_CHECKLIST_ITEMS.map((it) => ({
      checklistId: demoChecklist.id,
      key: it.key,
      label: it.label,
      status: ChecklistItemStatus.OK,
    })),
  );

  // Viaje finalizado con bitácora y liquidación (para ver/descargar el PDF).
  const demoStartOdo = demoTruck.currentOdometerKm - 800;
  const demoFinished = await tripRepo.save({
    code: 'VJ-DEMO0',
    truckId: demoTruck.id,
    trailerId: trailers[0].id,
    driverId: demoDriver.id,
    origin: 'Córdoba',
    destination: 'Buenos Aires',
    cargoDescription: 'Alimentos secos (demo)',
    plannedStartAt: at(-6, 6),
    plannedEndAt: at(-5, 20),
    startedAt: at(-6, 6),
    finishedAt: at(-5, 20),
    startOdometerKm: demoStartOdo,
    endOdometerKm: demoStartOdo + 700,
    distanceKm: 700,
    status: TripStatus.FINISHED,
  });
  await logRepo.save([
    { tripId: demoFinished.id, type: TripLogType.FUEL, amount: 220500, liters: 245, odometerKm: demoStartOdo + 350, occurredAt: at(-6, 12), notes: 'Carga en ruta (demo)' },
    { tripId: demoFinished.id, type: TripLogType.TOLL, amount: 12000, occurredAt: at(-6, 10), notes: 'Peajes (demo)' },
    { tripId: demoFinished.id, type: TripLogType.PER_DIEM, amount: 25000, occurredAt: at(-6, 8), notes: 'Viáticos (demo)' },
    { tripId: demoFinished.id, type: TripLogType.CASH_ADVANCE, amount: 40000, occurredAt: at(-6, 7), notes: 'Adelanto (demo)' },
  ]);
  await settlementRepo.save({
    tripId: demoFinished.id,
    totalsByType: {
      [TripLogType.FUEL]: 220500,
      [TripLogType.TOLL]: 12000,
      [TripLogType.PER_DIEM]: 25000,
      [TripLogType.CASH_ADVANCE]: 40000,
    },
    totalExpenses: round2(220500 + 12000 + 25000),
    totalAdvances: 40000,
    netToSettle: round2(220500 + 12000 + 25000 - 40000),
    status: SettlementStatus.DRAFT,
  });

  // ───────────────────────── Resumen ─────────────────────────
  const counts = {
    flotas: await fleetRepo.count(),
    camiones: await truckRepo.count(),
    acoplados: await trailerRepo.count(),
    empleados: await employeeRepo.count(),
    usuarios: await userRepo.count(),
    choferes: await driverRepo.count(),
    viajes: await tripRepo.count(),
    combustible: await fuelRepo.count(),
    incidentes: await incidentRepo.count(),
    mantenimiento: await orderRepo.count(),
    documentos: await docRepo.count(),
    oea: await oeaRepo.count(),
    mensajes: await messageRepo.count(),
    alertas: await alertRepo.count(),
  };

  console.log('\n✅ Seed completado. Resumen:');
  console.table(counts);
  console.log(
    `\n🔑 Usuarios creados con contraseña: ${PASSWORD}\n` +
      '   admin@fleetlog.com (admin), laura.gomez@fleetlog.com (manager),\n' +
      '   diego.fernandez@fleetlog.com (dispatcher), sofia.ramirez@fleetlog.com (hr),\n' +
      '   jorge.sosa@fleetlog.com (maintenance), marta.rios@fleetlog.com (auditor),\n' +
      '   choferes: carlos.pereyra@fleetlog.com … pablo.cabrera@fleetlog.com (driver)\n' +
      `\n👀 Cuentas DEMO (solo lectura, para mostrar a clientes) — contraseña: ${DEMO_PASSWORD}\n` +
      '   demo.admin@fleetlog.com (admin) y demo.chofer@fleetlog.com (driver)\n' +
      '   Pueden ver todo y descargar PDFs; no pueden modificar datos.',
  );

  await dataSource.destroy();
}

run().catch((err) => {
  console.error('❌ Error en el seed:', err);
  process.exit(1);
});
