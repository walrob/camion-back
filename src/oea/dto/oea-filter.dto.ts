import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OeaResult } from 'src/common/enums/oea.enum';

export class OeaFilterDto {
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
}
