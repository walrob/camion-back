import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { FuelType } from 'src/common/enums/fuel.enum';

export class CreateFuelRecordDto {
  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  // Si lo carga un chofer se deriva del usuario; la base puede indicarlo.
  @IsUUID()
  @IsOptional()
  driverId?: string;

  @IsUUID()
  @IsOptional()
  tripId?: string;

  @IsEnum(FuelType)
  @IsOptional()
  fuelType?: FuelType;

  @IsNumber()
  @Min(0)
  liters: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerLiter?: number;

  // Si no se envía, se calcula a partir de litros * precio por litro.
  @IsNumber()
  @Min(0)
  @IsOptional()
  totalAmount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  odometerKm?: number;

  @IsBoolean()
  @IsOptional()
  fullTank?: boolean;

  @IsString()
  @IsOptional()
  station?: string;

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

  @IsString()
  @IsOptional()
  clientId?: string;
}
