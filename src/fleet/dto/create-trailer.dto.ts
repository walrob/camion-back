import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TrailerStatus } from 'src/common/enums/trailerStatus.enum';

export class CreateTrailerDto {
  @IsString()
  @IsNotEmpty()
  plate: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  loadCapacityKg?: number;

  @IsEnum(TrailerStatus)
  @IsOptional()
  status?: TrailerStatus;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
