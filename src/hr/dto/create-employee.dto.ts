import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  documentId: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsEnum(EmployeePosition)
  @IsOptional()
  position?: EmployeePosition;

  @IsDateString()
  @IsOptional()
  hireDate?: string;

  @IsDateString()
  @IsOptional()
  terminationDate?: string;

  @IsEnum(EmploymentStatus)
  @IsOptional()
  employmentStatus?: EmploymentStatus;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @IsString()
  @IsOptional()
  emergencyContactPhone?: string;

  @IsString()
  @IsOptional()
  photoKey?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
