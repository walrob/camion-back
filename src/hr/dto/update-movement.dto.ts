import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateMovementDto } from './create-movement.dto';

/**
 * Un movimiento no se puede reasignar a otro empleado: para eso se borra y se
 * carga de nuevo, así el historial de cada legajo queda trazable.
 */
export class UpdateMovementDto extends PartialType(
  OmitType(CreateMovementDto, ['employeeId'] as const),
) {}
