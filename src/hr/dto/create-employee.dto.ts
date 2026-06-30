import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { EmployeePosition } from 'src/common/enums/employeePosition.enum';
import { EmploymentStatus } from 'src/common/enums/employmentStatus.enum';
import { Role } from 'src/common/enums/role.enum';

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

  // Vincular una cuenta de acceso ya existente.
  @IsUUID()
  @IsOptional()
  userId?: string;

  // ─── Alta de cuenta de acceso (opcional) ───
  // Si se envían email + password (y no userId), se crea el User y se vincula.
  // El rol se deriva del puesto (POSITION_ROLE) salvo que se indique `role`.
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

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
