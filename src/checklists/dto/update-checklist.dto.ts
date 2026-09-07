import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Los datos de cabecera que el chofer completa fuera de los puntos: el furgón,
 * si viaja acompañado, la observación general y dónde estaba al completarla.
 */
export class UpdateChecklistDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  trailerId?: string;

  @ApiPropertyOptional({ description: 'Si declara viajar con acompañante.' })
  @IsBoolean()
  @IsOptional()
  hasCompanion?: boolean;

  @ApiPropertyOptional({
    description: 'Desarrolle cualquier otro punto que considere importante.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional()
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional()
  @IsLongitude()
  @IsOptional()
  lng?: number;
}
