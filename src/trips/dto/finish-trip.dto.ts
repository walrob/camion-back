import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class FinishTripDto {
  @IsInt()
  @Min(0)
  endOdometerKm: number;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;
}
