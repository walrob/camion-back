import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { Certification } from './entities/certification.entity';
import { TruckAssignment } from './entities/truck-assignment.entity';
import { EmploymentMovement } from './entities/employment-movement.entity';
import { Driver } from 'src/drivers/entities/driver.entity';
import { Trip } from 'src/trips/entities/trip.entity';
import { EmployeesService } from './employees.service';
import { CertificationsService } from './certifications.service';
import { AssignmentsService } from './assignments.service';
import { EmploymentMovementsService } from './employment-movements.service';
import { EmployeesController } from './employees.controller';
import { CertificationsController } from './certifications.controller';
import { AssignmentsController } from './assignments.controller';
import { EmploymentMovementsController } from './employment-movements.controller';
import { AuthModule } from 'src/auth/auth.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Certification,
      TruckAssignment,
      EmploymentMovement,
      // Solo lectura: para verificar que el chofer no tenga viajes abiertos
      // antes de cargarle una licencia, suspensión o baja.
      Driver,
      Trip,
    ]),
    forwardRef(() => AuthModule),
    AlertsModule,
    UsersModule,
  ],
  controllers: [
    EmployeesController,
    CertificationsController,
    AssignmentsController,
    EmploymentMovementsController,
  ],
  providers: [
    EmployeesService,
    CertificationsService,
    AssignmentsService,
    EmploymentMovementsService,
  ],
  exports: [
    EmployeesService,
    CertificationsService,
    AssignmentsService,
    EmploymentMovementsService,
  ],
})
export class HrModule {}
