import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignIncidentDto {
  @IsUUID()
  @IsNotEmpty()
  assignedToUserId: string;
}
