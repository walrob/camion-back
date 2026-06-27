import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TruckStatus } from 'src/common/enums/truckStatus.enum';

export class CreateTruckDto {
  @IsString()
  @IsNotEmpty()
  plate: string;

  @IsString()
  @IsOptional()
  internalNumber?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsInt()
  @IsOptional()
  year?: number;

  @IsString()
  @IsOptional()
  type?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  loadCapacityKg?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  currentOdometerKm?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  engineHours?: number;

  @IsEnum(TruckStatus)
  @IsOptional()
  status?: TruckStatus;

  @IsUUID()
  @IsOptional()
  fleetId?: string;
}
