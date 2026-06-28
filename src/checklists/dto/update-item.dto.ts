import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ChecklistItemStatus } from 'src/common/enums/checklist.enum';

export class UpdateChecklistItemDto {
  @IsEnum(ChecklistItemStatus)
  @IsOptional()
  status?: ChecklistItemStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
