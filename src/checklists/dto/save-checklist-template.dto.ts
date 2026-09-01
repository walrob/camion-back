import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChecklistTemplateItemDto {
  /**
   * Clave estable del punto. La genera la pantalla a partir del nombre y no se
   * vuelve a tocar: es lo que ata el ítem con su histórico
   * (docs/CONFIGURACION.md §2.2).
   */
  @ApiProperty({ example: 'cadenas_nieve' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'La clave sólo admite minúsculas, números y guión bajo.',
  })
  key: string;

  @ApiProperty({ example: 'Cadenas de nieve' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ description: 'En falla, rechaza el checklist.' })
  @IsBoolean()
  @IsOptional()
  isCritical?: boolean;

  @ApiPropertyOptional({ description: 'En falla, exige foto antes de firmar.' })
  @IsBoolean()
  @IsOptional()
  requiresPhotoOnFail?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class SaveChecklistTemplateDto {
  @ApiProperty({ example: 'Checklist general' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  /** `null` o ausente = plantilla general de la empresa. */
  @ApiPropertyOptional({ example: 'tractor' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  vehicleType?: string | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ type: [ChecklistTemplateItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistTemplateItemDto)
  items: ChecklistTemplateItemDto[];
}
