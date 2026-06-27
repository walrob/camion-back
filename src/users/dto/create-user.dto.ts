import { IsBoolean, IsOptional, IsString, IsEnum, IsEmail, IsDate } from 'class-validator';
import { Role } from 'src/common/enums/role.enum';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  password: string;

  @IsBoolean()
  isEmailVerified: boolean;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsBoolean()
  isTemplateDark?: boolean;

  @IsOptional()
  @IsString()
  phone?: string;
}
