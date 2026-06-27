import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class PasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @Transform(({ value }) => value.trim())
  passwordCurrent: string;

  @IsString()
  @MinLength(6)
  @Transform(({ value }) => value.trim())
  passwordNew: string;
}
