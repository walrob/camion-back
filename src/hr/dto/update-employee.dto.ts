import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateEmployeeDto } from './create-employee.dto';

/**
 * El PATCH no crea ni cambia la cuenta de acceso: los campos de alta de cuenta
 * (email/password/role) se excluyen. La gestión del User vive en sus endpoints.
 */
export class UpdateEmployeeDto extends PartialType(
  OmitType(CreateEmployeeDto, ['email', 'password', 'role'] as const),
) {}
