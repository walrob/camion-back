import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ChecklistAnswer,
  ChecklistItemType,
} from 'src/common/enums/checklist.enum';

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

  /** Bloque de la planilla: «Estado del tractor», «Estado del equipo de frío». */
  @ApiPropertyOptional({ example: 'Estado del tractor' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  section?: string | null;

  /** Advertencia o instrucción que se muestra junto al punto. */
  @ApiPropertyOptional({
    example:
      'En caso de presentar alguna alarma, avisar de inmediato a Tráfico.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  helpText?: string | null;

  @ApiPropertyOptional({ enum: ChecklistItemType })
  @IsEnum(ChecklistItemType)
  @IsOptional()
  type?: ChecklistItemType;

  @ApiPropertyOptional({
    enum: ChecklistAnswer,
    description:
      'La respuesta que indica que está todo bien. «¿Tiene pérdidas?» espera NO.',
  })
  @IsEnum(ChecklistAnswer)
  @IsOptional()
  expectedAnswer?: ChecklistAnswer;

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

  @ApiPropertyOptional({
    description: 'Exige foto siempre, más allá de cómo salga el punto.',
  })
  @IsBoolean()
  @IsOptional()
  requiresPhoto?: boolean;

  @ApiPropertyOptional({ description: 'Cuántas fotos como mínimo.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  minPhotos?: number;

  @ApiPropertyOptional({ description: 'Tope de fotos. Sin valor, sin tope.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxPhotos?: number | null;

  @ApiPropertyOptional({
    description:
      'En falla, la planilla queda pendiente de validación de Tráfico en vez de resolverse sola.',
  })
  @IsBoolean()
  @IsOptional()
  requiresValidationOnFail?: boolean;

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

  /** Código del formulario en el sistema documental de la empresa. */
  @ApiPropertyOptional({ example: 'RIP 06 09 01' })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string | null;

  @ApiPropertyOptional({ example: 'REV.04' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  revision?: string | null;

  @ApiPropertyOptional({ example: '2026-08-27' })
  @IsDateString()
  @IsOptional()
  revisionDate?: string | null;

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
