import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from 'src/common/enums/role.enum';

/**
 * Acceso a la app para un legajo que se dio de alta sin cuenta. Mismos datos
 * que la sección "Acceso a la app" del alta.
 */
export class GrantAccessDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  /** Si no viene, se deriva del puesto. */
  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}
