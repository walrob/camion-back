import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class SignChecklistDto {
  // Key del archivo de firma ya subido a S3 (vía módulo attachments).
  @IsString()
  @IsNotEmpty()
  signatureKey: string;

  /**
   * Dónde estaba el chofer al firmar. Una planilla «previo al ingreso a
   * cargar» firmada a 200 km del cliente no es la misma planilla; si la empresa
   * lo exige (`checklist.requireGeolocation`), sin esto no se puede firmar.
   */
  @ApiPropertyOptional()
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional()
  @IsLongitude()
  @IsOptional()
  lng?: number;
}
