import { IsString, IsNotEmpty } from 'class-validator';

export class UploadAttachmentDto {
  @IsString()
  @IsNotEmpty()
  entityType: string;

  @IsString()
  @IsNotEmpty()
  entityId: string;
}
