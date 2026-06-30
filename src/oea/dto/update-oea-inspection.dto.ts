import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateOeaInspectionDto } from './create-oea-inspection.dto';

export class UpdateOeaInspectionDto extends PartialType(
  OmitType(CreateOeaInspectionDto, ['truckId', 'clientId'] as const),
) {}
