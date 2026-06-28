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

  @IsEnum(DocumentCategory)
  @IsNotEmpty()
  category: DocumentCategory;

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
