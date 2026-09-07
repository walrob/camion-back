import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class SaveCompanionDto {
  /**
   * Legajo de la persona, si ya está en el sistema.
   *
   * Con esto, el nombre y el documento salen de RRHH y no se tipean: son el
   * mismo dato, y tipearlo de nuevo sólo agrega una forma de escribirlo mal.
   */
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  /** Obligatorio sólo si no viene del legajo. */
  @ApiPropertyOptional({ example: 'María López' })
  @ValidateIf((o) => !o.employeeId)
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: '30123456' })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  document?: string;

  @ApiPropertyOptional({ example: 'Cónyuge' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  relationship?: string;

  /**
   * Declaración del chofer de haber pedido el seguro a su operador de tráfico.
   * Quien lo confirma es Tráfico, al validar la planilla.
   */
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  insuranceRequested?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
