import {

  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';


export class CreateTripLogEntryDto {
  @IsUUID()
  @IsNotEmpty()
  tripId: string;

  /**
   * Clave del tipo de gasto. No se valida contra un enum: la empresa puede
   * tener tipos propios. Que exista y esté activo lo verifica el servicio
   * contra el catálogo de la empresa (docs/CONFIGURACION.md §5).
   */
  @IsString()
  @IsNotEmpty()
  type: string;

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
