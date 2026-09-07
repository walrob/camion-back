import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * La resolución de Tráfico sobre una planilla que quedó pendiente.
 *
 * El motivo es obligatorio cuando no se libera: «no sale» sin explicación no le
 * sirve a nadie, ni al chofer que espera ni a la auditoría que lo lee después.
 */
export class ValidateChecklistDto {
  @ApiProperty({
    description: 'true libera la unidad; false la deja rechazada.',
  })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
