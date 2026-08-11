import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72)
  password: string;
}
