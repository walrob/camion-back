import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Plan } from './entities/plan.entity';

@ApiTags('Planes')
@Controller('plans')
export class PlansController {
  constructor(
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
  ) {}

  /**
   * Catálogo comercial para la landing. **Público**: lo consulta gente que
   * todavía no tiene cuenta.
   *
   * Devuelve sólo los planes marcados `isPublic`, así que el plan interno
   * `legacy` no se muestra. Que los precios salgan de la base es lo que permite
   * cambiarlos sin un deploy (decisión D8).
   */
  @Get('public')
  @ApiOperation({ summary: 'Planes publicables, con sus precios vigentes.' })
  async publicos() {
    const planes = await this.plansRepository.find({
      where: { isPublic: true },
      order: { sortOrder: 'ASC' },
    });

    // Se expone sólo lo que la landing necesita: nada de límites internos ni
    // identificadores que no le sirven a un visitante.
    return planes.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      baseFee: Number(p.baseFee),
      pricePerVehicle: Number(p.pricePerVehicle),
      minVehicles: p.minVehicles,
      setupFee: Number(p.setupFee),
      isNegotiated: p.isNegotiated,
      features: p.features ?? [],
      limits: p.limits ?? null,
    }));
  }
}
