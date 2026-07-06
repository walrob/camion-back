import { IsEnum } from 'class-validator';
import { IncidentSeverity } from 'src/common/enums/incident.enum';

export class ChangeIncidentSeverityDto {
  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;
}
