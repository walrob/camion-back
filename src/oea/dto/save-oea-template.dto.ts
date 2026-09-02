import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OeaSection } from 'src/common/enums/oea.enum';

export class OeaTemplateItemDto {
  @ApiProperty({ example: 'faja_propia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'La clave sólo admite minúsculas, números y guión bajo.',
  })
  key: string;

  @ApiProperty({ example: 'Faja de seguridad propia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiProperty({ enum: OeaSection })
  @IsIn([OeaSection.PHYSICAL, OeaSection.SECURITY_DEVICES])
  section: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class SaveOeaTemplateDto {
  /** Sólo los puntos propios: los de la norma no se mandan ni se editan. */
  @ApiProperty({ type: [OeaTemplateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OeaTemplateItemDto)
  items: OeaTemplateItemDto[];
}
