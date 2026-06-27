import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateOdometerDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  currentOdometerKm?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  engineHours?: number;
}
