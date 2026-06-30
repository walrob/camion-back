import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class OverviewQueryDto {
  @ApiPropertyOptional({
    enum: ['today', '7d', '30d'],
    default: '7d',
    description: 'Rango temporal para el bloque de tendencias (trends).',
  })
  @IsOptional()
  @IsIn(['today', '7d', '30d'])
  range?: 'today' | '7d' | '30d';
}
