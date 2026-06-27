import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';

export class UpdateDriverDto {
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
