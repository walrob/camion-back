import { IsNotEmpty, IsString } from 'class-validator';

export class SignChecklistDto {
  // Key del archivo de firma ya subido a S3 (vía módulo attachments).
  @IsString()
  @IsNotEmpty()
  signatureKey: string;
}
