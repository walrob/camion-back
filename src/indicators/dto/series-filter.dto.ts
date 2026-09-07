import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { IndicatorFilterDto } from './indicator-filter.dto';

export type SeriesBucket = 'day' | 'week' | 'month';

export const SERIES_BUCKETS: SeriesBucket[] = ['day', 'week', 'month'];

/**
 * Filtro de las series temporales: los mismos filtros del summary más el paso
 * de agregación.
 *
 * `bucket` es opcional a propósito. La granularidad correcta depende del ancho
 * de la ventana —un año en pasos diarios es ruido, una semana en pasos
 * mensuales es un solo punto— y el servicio la elige sola cuando no viene.
 */
export class SeriesFilterDto extends IndicatorFilterDto {
  @ApiPropertyOptional({
    enum: SERIES_BUCKETS,
    description:
      'Paso de la serie. Si se omite, se elige según el ancho de la ventana.',
  })
  @IsOptional()
  @IsIn(SERIES_BUCKETS)
  bucket?: SeriesBucket;
}
