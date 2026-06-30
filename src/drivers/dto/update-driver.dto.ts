import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateDriverDto } from './create-driver.dto';

/**
 * Solo campos operativos. `employeeId` se omite: el vínculo con el legajo es la
 * identidad del chofer y no se reasigna por PATCH. Los datos personales se editan
 * exclusivamente vía los endpoints de Employee (PATCH /hr/employees/:id).
 */
export class UpdateDriverDto extends PartialType(
  OmitType(CreateDriverDto, ['employeeId'] as const),
) {}
