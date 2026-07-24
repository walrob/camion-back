import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateEmployeeDto } from './create-employee.dto';

/**
 * El PATCH no crea ni cambia la cuenta de acceso: los campos de alta de cuenta
 * (email/password/role) se excluyen. La gestión del User vive en sus endpoints.
 *
 * `hireDate` tampoco se edita acá: la fecha de ingreso vive en el movimiento de
 * alta del legajo, junto con el resto del historial (`PATCH /hr/movements/:id`).
 */
export class UpdateEmployeeDto extends PartialType(
  OmitType(CreateEmployeeDto, [
    'email',
    'password',
    'role',
    'hireDate',
  ] as const),
) {}
