import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class SaveRateDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  code: string;

  @ApiProperty({ example: '2026-09-01', description: 'Día al que aplica.' })
  @IsDateString()
  date: string;

  @ApiProperty({
    example: 1150,
    description: 'Cuántas unidades de la moneda base vale UNA de esta moneda.',
  })
  @IsNumber()
  rate: number;

  @ApiPropertyOptional({ enum: ['manual', 'api'] })
  @IsIn(['manual', 'api'])
  @IsOptional()
  source?: string;
}
