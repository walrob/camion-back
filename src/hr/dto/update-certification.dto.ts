import { PartialType } from '@nestjs/mapped-types';
import { OmitType } from '@nestjs/mapped-types';
import { CreateCertificationDto } from './create-certification.dto';

// No se permite mover una certificación de empleado al editar.
export class UpdateCertificationDto extends PartialType(
  OmitType(CreateCertificationDto, ['employeeId'] as const),
) {}
