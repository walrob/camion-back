import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { MaintenanceOrderStatus } from 'src/common/enums/maintenance.enum';

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  @IsUUID()
  @IsOptional()
  planId?: string;

  @IsString()
  @IsNotEmpty()
  date: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  odometerKm?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  items?: { name: string; cost?: number }[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  cost?: number;

  @IsEnum(MaintenanceOrderStatus)
  @IsOptional()
  status?: MaintenanceOrderStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
