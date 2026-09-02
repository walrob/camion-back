import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CertificationType } from 'src/common/enums/certificationType.enum';

export class CreateCertificationDto {
  @IsUUID()
  @IsNotEmpty()
  employeeId: string;

  // Del catálogo de la empresa: lo valida el servicio (CONFIGURACION §5).
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  class?: string;

  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  issuedBy?: string;

  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  fileKey?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
