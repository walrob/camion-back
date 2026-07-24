import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  EmploymentMovementType,
  LeaveType,
} from 'src/common/enums/employmentMovement.enum';

export class CreateMovementDto {
  @IsUUID()
  @IsNotEmpty()
  employeeId: string;

  @IsEnum(EmploymentMovementType)
  type: EmploymentMovementType;

  /** Obligatorio (y solo válido) cuando `type` es LEAVE. */
  @IsEnum(LeaveType)
  @IsOptional()
  leaveType?: LeaveType;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  /** Solo para licencias y suspensiones. Vacío = período abierto. */
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  fileKey?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
