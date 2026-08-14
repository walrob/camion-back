import { IsBoolean, IsOptional, IsString, IsEnum, IsEmail, IsDate } from 'class-validator';
import { Role } from 'src/common/enums/role.enum';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  password: string;

  /**
   * Cuándo quedó confirmada la casilla. Se completa cuando el alta prueba por
   * sí misma que la dirección es real —la crea un administrador, o llega por un
   * link enviado a esa casilla— y se omite en el alta pública, que confirma
   * después con el mail de verificación.
   *
   * Reemplaza al viejo `isEmailVerified`, que era un booleano del template sin
   * columna detrás: se seteaba en `true` en todos lados y no se guardaba en
   * ninguno.
   */
  @IsOptional()
  @IsDate()
  emailVerifiedAt?: Date;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsBoolean()
  isTemplateDark?: boolean;

  @IsOptional()
  @IsString()
  phone?: string;
}
