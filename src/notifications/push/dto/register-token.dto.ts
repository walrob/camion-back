import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsOptional()
  platform?: string;
}
