import { IsNotEmpty, IsString } from 'class-validator';

export class CommentIncidentDto {
  @IsString()
  @IsNotEmpty()
  note: string;
}
