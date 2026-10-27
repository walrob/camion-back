import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DriverStatus } from 'src/common/enums/driverStatus.enum';

/**
 * Legajo mínimo del chofer, para darlo de alta sin pasar por RRHH.
 *
 * Es lo justo para que el sistema tenga a quién asignarle un viaje: el plan
 * Control no incluye RRHH, y sin esto no había forma de cargar un chofer a mano.
 * El resto del legajo (domicilio, ingreso, permisos) es de RRHH.
 */
export class DriverPersonDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  documentId: string;

  @IsString()
  @IsOptional()
  phone?: string;

  // Acceso a la app (opcional). El rol es siempre Chofer: desde acá no se
  // crean cuentas con otro rol.
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}

export class CreateDriverDto {
  // El alta vincula un Employee (legajo) existente con su perfil de conducción,
  // o crea uno mínimo con `person`. Uno de los dos es obligatorio.
  @ValidateIf((o: CreateDriverDto) => !o.person)
  @IsUUID()
  @IsNotEmpty()
  employeeId?: string;

  @ValidateIf((o: CreateDriverDto) => !o.employeeId)
  @ValidateNested()
  @Type(() => DriverPersonDto)
  @IsNotEmpty()
  person?: DriverPersonDto;

  // Datos operativos (de conducción)
  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsString()
  @IsOptional()
  licenseType?: string;

  @IsDateString()
  @IsOptional()
  licenseExpiry?: string;

  @IsEnum(DriverStatus)
  @IsOptional()
  status?: DriverStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

/** Acceso a la app para un chofer que se cargó sin cuenta. */
export class DriverAccessDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
