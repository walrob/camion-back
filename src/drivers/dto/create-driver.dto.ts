import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';

export class CreateDriverDto {
  // El alta vincula un Employee (legajo) existente con su perfil de conducción.
  // El dato personal y el login ya viven en ese Employee.
  @IsUUID()
  @IsNotEmpty()
  employeeId: string;

  // Datos operativos (de conducción)
  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsString()
  @IsOptional()
  licenseType?: string;

  @IsDateString()
  @IsOptional()
  licenseExpiry?: string;

  @IsEnum(DriverStatus)
  @IsOptional()
  status?: DriverStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
