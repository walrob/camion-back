import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateTripDto {
  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  @IsUUID()
  @IsOptional()
  trailerId?: string;

  @IsUUID()
  @IsNotEmpty()
  driverId: string;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  origin: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsString()
  @IsOptional()
  cargoDescription?: string;

  @IsDateString()
  @IsOptional()
  plannedStartAt?: string;

  @IsDateString()
  @IsOptional()
  plannedEndAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * Confirmación explícita para asignar el viaje a un chofer que está de
   * licencia: la finaliza el día anterior al inicio del viaje y deja registro
   * en el legajo. Sin esto, la asignación se rechaza. No sirve para
   * suspensiones ni bajas, que bloquean siempre.
   */
  @IsBoolean()
  @IsOptional()
  closeLeave?: boolean;
}
