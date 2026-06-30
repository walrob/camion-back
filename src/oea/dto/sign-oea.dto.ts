import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OeaResult } from 'src/common/enums/oea.enum';

export class SignOeaDto {
  @IsString()
  @IsNotEmpty()
  signatureKey: string;

  // Resultado final declarado al firmar (conforme / no conforme).
  @IsEnum(OeaResult)
  @IsOptional()
  result?: OeaResult;
}
