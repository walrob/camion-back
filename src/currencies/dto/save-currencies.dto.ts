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
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CompanyCurrencyDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 3, { message: 'El código de moneda es de 3 letras (ISO 4217).' })
  code: string;

  @ApiPropertyOptional({ example: 'US$' })
  @IsString()
  @IsOptional()
  symbol?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(4)
  @IsOptional()
  decimals?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class SaveCurrenciesDto {
  @ApiProperty({ type: [CompanyCurrencyDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompanyCurrencyDto)
  currencies: CompanyCurrencyDto[];
}
