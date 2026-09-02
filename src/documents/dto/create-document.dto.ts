import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  DocumentCategory,
  DocumentOwnerType,
} from 'src/common/enums/document.enum';

export class CreateDocumentDto {
  @IsEnum(DocumentOwnerType)
  ownerType: DocumentOwnerType;

  @IsString()
  @IsOptional()
  ownerId?: string;

  // La lista la define cada empresa: la valida el servicio contra su catálogo
  // (docs/CONFIGURACION.md §5).
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  issueDate?: string;

  @IsString()
  @IsOptional()
  expiryDate?: string;
}
