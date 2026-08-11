import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Alta pública de una empresa desde la landing.
 *
 * Se piden los datos mínimos para poder operar y facturar. Todo lo demás
 * —logo, sucursales, flota— se completa en el onboarding guiado: pedirlo acá
 * alarga el formulario y baja la conversión, que es lo contrario de lo que
 * busca una barrera de entrada baja (MODELO-COMERCIAL §1.3).
 */
export class RegisterCompanyDto {
  // ── Empresa ──────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({ message: 'La razón social es obligatoria.' })
  @MaxLength(150)
  companyName: string;

  /** CUIT sin guiones ni puntos. Opcional en el alta: se completa al facturar. */
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'El CUIT debe tener 11 dígitos, sin guiones.' })
  cuit?: string;

  // ── Usuario administrador ────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(120)
  adminName: string;

  @IsEmail({}, { message: 'El email no es válido.' })
  adminEmail: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72) // Límite de bcrypt: más allá de 72 bytes se trunca en silencio.
  adminPassword: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
