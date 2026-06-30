import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateOeaInspectionDto {
  @IsUUID()
  @IsOptional()
  tripId?: string;

  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  @IsUUID()
  @IsOptional()
  trailerId?: string;

  // Si lo crea un chofer se deriva del usuario; la base puede indicarlo.
  @IsUUID()
  @IsOptional()
  driverId?: string;

  // ─── Sección 1: transporte y documentación ───
  @IsString()
  @IsOptional()
  tripNumber?: string;

  @IsString()
  @IsOptional()
  origin?: string;

  @IsString()
  @IsOptional()
  destination?: string;

  @IsString()
  @IsOptional()
  cargoDescription?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  cargoWeightKg?: number;

  @IsString()
  @IsOptional()
  customsSealNumber?: string;

  @IsString()
  @IsOptional()
  securitySealNumber?: string;

  @IsString()
  @IsOptional()
  driverDocument?: string;

  @IsString()
  @IsOptional()
  driverLicense?: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  clientId?: string;
}
