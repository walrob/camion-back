import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BEHAVIOR } from '../catalogs.catalog';

export class CatalogItemDto {
  @ApiProperty({ example: 'balanza' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'La clave sólo admite minúsculas, números y guión bajo.',
  })
  key: string;

  @ApiProperty({ example: 'Balanza' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(40)
  color?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(60)
  icon?: string;

  @ApiPropertyOptional({ enum: [BEHAVIOR.EXPENSE, BEHAVIOR.ADVANCE] })
  @IsIn([BEHAVIOR.EXPENSE, BEHAVIOR.ADVANCE])
  @IsOptional()
  behavior?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class SaveCatalogDto {
  /**
   * El catálogo completo, en orden. Lo que no venga en la lista se desactiva:
   * es como se edita en pantalla y evita un endpoint por operación.
   */
  @ApiProperty({ type: [CatalogItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CatalogItemDto)
  items: CatalogItemDto[];
}
