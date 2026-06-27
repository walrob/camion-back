import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';

export class CreateDriverDto {
  // Datos para crear el usuario asociado (rol DRIVER)
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  // Datos del perfil de chofer
  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsString()
  @IsOptional()
  licenseType?: string;

  @IsDateString()
  @IsOptional()
  licenseExpiry?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(DriverStatus)
  @IsOptional()
  status?: DriverStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
