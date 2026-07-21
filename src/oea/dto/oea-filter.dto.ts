import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OeaResult } from 'src/common/enums/oea.enum';

export class OeaFilterDto {
  /** Texto libre: patente, chofer o número de viaje. */
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  truckId?: string;

  @IsString()
  @IsOptional()
  driverId?: string;

  @IsEnum(OeaResult)
  @IsOptional()
  result?: OeaResult;

  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  @IsOptional()
  to?: string;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsString()
  @IsOptional()
  order?: string;
}
