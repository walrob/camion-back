import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SetThresholdDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
