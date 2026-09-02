import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AlertRuleDto {
  @ApiProperty({ example: 'truck.idle' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiPropertyOptional({ description: 'Si la empresa quiere esta alerta.' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  /** Viaja como texto y lo valida el servicio contra el rango de la regla. */
  @ApiPropertyOptional({ example: '8' })
  @IsString()
  @IsOptional()
  value?: string;
}

export class SaveAlertRulesDto {
  @ApiProperty({ type: [AlertRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AlertRuleDto)
  rules: AlertRuleDto[];
}
