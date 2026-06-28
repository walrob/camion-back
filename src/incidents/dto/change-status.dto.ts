import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentStatus } from 'src/common/enums/incident.enum';

export class ChangeIncidentStatusDto {
  @IsEnum(IncidentStatus)
  status: IncidentStatus;

  @IsString()
  @IsOptional()
  note?: string;
}
