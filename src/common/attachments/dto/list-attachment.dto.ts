import { IsString, IsNotEmpty } from 'class-validator';

export class ListAttachmentDto {
  @IsString()
  @IsNotEmpty()
  entityType: string;

  @IsString()
  @IsNotEmpty()
  entityId: string;
}
