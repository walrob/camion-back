import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OeaItemStatus } from 'src/common/enums/oea.enum';

export class UpdateOeaItemDto {
  @IsEnum(OeaItemStatus)
  @IsOptional()
  status?: OeaItemStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
