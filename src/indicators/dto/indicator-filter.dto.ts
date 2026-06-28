import { IsOptional, IsString } from 'class-validator';

export class IndicatorFilterDto {
  @IsString()
  @IsOptional()
  truckId?: string;

  @IsString()
  @IsOptional()
  driverId?: string;

  @IsString()
  @IsOptional()
  fleetId?: string;

  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  @IsOptional()
  to?: string;
}
