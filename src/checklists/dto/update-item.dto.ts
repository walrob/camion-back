import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  ChecklistAnswer,
  ChecklistItemStatus,
} from 'src/common/enums/checklist.enum';

export class UpdateChecklistItemDto {
  /**
   * Lo que contestó el chofer. Cuando viene, el `status` lo deriva el servidor
   * contra el `expectedAnswer` del ítem: una pregunta en negativo —«¿tiene
   * pérdidas?»— no puede depender de que el cliente invierta bien el mapeo.
   */
  @ApiPropertyOptional({ enum: ChecklistAnswer })
  @IsEnum(ChecklistAnswer)
  @IsOptional()
  answer?: ChecklistAnswer;

  /**
   * Estado directo. Sigue aceptándose para no romper a los clientes que ya
   * mandan esto; si vienen los dos, manda `answer`.
   */
  @ApiPropertyOptional({ enum: ChecklistItemStatus })
  @IsEnum(ChecklistItemStatus)
  @IsOptional()
  status?: ChecklistItemStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
