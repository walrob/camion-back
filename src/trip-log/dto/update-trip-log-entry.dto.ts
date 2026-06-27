import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateTripLogEntryDto } from './create-trip-log-entry.dto';

export class UpdateTripLogEntryDto extends PartialType(
  OmitType(CreateTripLogEntryDto, ['tripId', 'clientId'] as const),
) {}
