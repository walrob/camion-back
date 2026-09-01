import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmptyObject } from 'class-validator';

export class UpdateSettingsDto {
  /**
   * Mapa clave → valor. El valor viaja como texto y lo valida el servicio
   * contra el tipo declarado en el catálogo (`settings.catalog.ts`): un DTO con
   * un campo por ajuste habría que tocarlo cada vez que se agrega uno.
   */
  @ApiProperty({
    example: { 'trip.requireChecklistToStart': 'false', 'trip.codePrefix': 'VJ-' },
  })
  @IsObject()
  @IsNotEmptyObject()
  values: Record<string, string>;
}
