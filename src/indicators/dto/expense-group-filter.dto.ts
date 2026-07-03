import { IsIn } from 'class-validator';
import { IndicatorFilterDto } from './indicator-filter.dto';

export type ExpenseGroup = 'truck' | 'driver';

// Filtro del detalle de gastos: mismos filtros del summary + la dimensión a agrupar.
export class ExpenseGroupFilterDto extends IndicatorFilterDto {
  @IsIn(['truck', 'driver'])
  group: ExpenseGroup;
}
