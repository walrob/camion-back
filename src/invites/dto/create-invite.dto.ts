import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from 'src/common/enums/role.enum';

export class CreateInviteDto {
  @IsEmail({}, { message: 'El email no es válido.' })
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsEnum(Role, { message: 'Rol inválido.' })
  role: Role;
}
