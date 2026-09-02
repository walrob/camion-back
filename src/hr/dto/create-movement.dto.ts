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
  // Del catálogo de la empresa: lo valida el servicio (CONFIGURACION §5).
  @IsString()
  @IsOptional()
  leaveType?: string;

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
