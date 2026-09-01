import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  IncidentSeverity,
  IncidentType,
} from 'src/common/enums/incident.enum';

export class CreateIncidentDto {
  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  @IsUUID()
  @IsOptional()
  tripId?: string;

  /**
   * Clave del tipo de incidente: la valida el servicio contra el catálogo de
   * la empresa, que puede tener tipos propios (docs/CONFIGURACION.md §5).
   */
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsEnum(IncidentSeverity)
  @IsOptional()
  severity?: IncidentSeverity;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;
}
