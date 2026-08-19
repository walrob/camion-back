import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Cuerpo de toda reapertura: alerta, orden de taller, liquidación.
 *
 * El motivo es obligatorio y por eso vive en un DTO propio y no como campo
 * opcional de la actualización: reabrir no es "editar el estado", es un acto
 * que alguien va a tener que explicar. El largo mínimo lo vuelve a validar el
 * servicio, que es donde también se decide quién puede hacerlo.
 */
export class ReopenDto {
  @ApiProperty({ example: 'El problema volvió a aparecer en el viaje 1043.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason: string;
}
