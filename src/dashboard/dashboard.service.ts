import { Injectable } from '@nestjs/common';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

/**
 * Dashboard gerencial. Stub inicial — se implementa en la Fase 8
 * (overview de flota: camiones por estado, incidentes, gastos del día, etc.).
 */
@Injectable()
export class DashboardService {
  getDashboard(_user: ActiveUserInterface) {
    return {
      message: 'Dashboard pendiente de implementación (Fase 8)',
    };
  }
}
