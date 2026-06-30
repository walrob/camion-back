import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { Certification } from './entities/certification.entity';
import { TruckAssignment } from './entities/truck-assignment.entity';
import { EmployeesService } from './employees.service';
import { CertificationsService } from './certifications.service';
import { AssignmentsService } from './assignments.service';
import { EmployeesController } from './employees.controller';
import { CertificationsController } from './certifications.controller';
import { AssignmentsController } from './assignments.controller';
import { AuthModule } from 'src/auth/auth.module';
import { AlertsModule } from 'src/alerts/alerts.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Certification, TruckAssignment]),
    forwardRef(() => AuthModule),
    AlertsModule,
    UsersModule,
  ],
  controllers: [
    EmployeesController,
    CertificationsController,
    AssignmentsController,
  ],
  providers: [EmployeesService, CertificationsService, AssignmentsService],
  exports: [EmployeesService, CertificationsService, AssignmentsService],
})
export class HrModule {}
