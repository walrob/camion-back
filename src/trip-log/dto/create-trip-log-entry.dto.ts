import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TripLogType } from 'src/common/enums/tripLogType.enum';

export class CreateTripLogEntryDto {
  @IsUUID()
  @IsNotEmpty()
  tripId: string;

  @IsEnum(TripLogType)
  type: TripLogType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  liters?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  odometerKm?: number;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsOptional()
  occurredAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // Para sync offline idempotente (opcional).
  @IsString()
  @IsOptional()
  clientId?: string;
}
