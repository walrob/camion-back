import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateChecklistDto {
  @IsUUID()
  @IsNotEmpty()
  tripId: string;

  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  /** El furgón / semi. Va aparte del tractor: son dos patentes distintas. */
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  trailerId?: string;

  @IsUUID()
  @IsNotEmpty()
  driverId: string;

  /**
   * Identificador que genera la app del chofer para poder reintentar el alta
   * sin duplicarla. Estas planillas se completan en la playa de carga, muchas
   * veces sin señal: sin idempotencia, cada reintento crea otro checklist.
   */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  clientId?: string;
}
