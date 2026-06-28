import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  MaintenancePlanStatus,
  MaintenanceTriggerType,
} from 'src/common/enums/maintenance.enum';

export class CreatePlanDto {
  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(MaintenanceTriggerType)
  triggerType: MaintenanceTriggerType;

  @IsInt()
  @Min(1)
  intervalValue: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  lastServiceKm?: number;

  @IsString()
  @IsOptional()
  lastServiceAt?: string;

  @IsEnum(MaintenancePlanStatus)
  @IsOptional()
  status?: MaintenancePlanStatus;
}
