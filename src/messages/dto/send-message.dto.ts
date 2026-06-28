import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  // Destinatario: un usuario puntual o un rol (ej. "dispatcher").
  @IsUUID()
  @IsOptional()
  toUserId?: string;

  @IsString()
  @IsOptional()
  toRole?: string;

  @IsUUID()
  @IsOptional()
  tripId?: string;
}
