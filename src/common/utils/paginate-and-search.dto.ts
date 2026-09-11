import {
  IsOptional,
  IsString,
  IsArray,
  ArrayNotEmpty,
  IsIn,
  IsObject,
  IsNumber,
  Min,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { SelectQueryBuilder } from 'typeorm';

export class PaginateAndSearchDto {
  @IsNumber()
  @Min(1)
  page: number;

  @IsNumber()
  @Min(1)
  limit: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  searchFields: string[];

  @IsString()
  orderBy: string;

  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC';

  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  @IsOptional()
  to?: string;

  @IsString()
  @IsOptional()
  dateField?: string;

  @IsOptional()
  @IsObject()
  baseWhere?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  select?: string[];

  /**
   * Condiciones que no entran en `baseWhere` (igualdad por columna): un
   * subquery, una comparación con la fecha de hoy, etc. El alias raíz es
   * `entity`.
   */
  @IsOptional()
  extraWhere?: (qb: SelectQueryBuilder<any>) => void;
}
