import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class StartTripDto {
  @IsInt()
  @Min(0)
  startOdometerKm: number;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;
}
