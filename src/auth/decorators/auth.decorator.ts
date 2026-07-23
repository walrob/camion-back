import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthGuard } from '../guard/auth.guard';
import { RolesGuard } from '../guard/roles.guard';
import { DemoReadOnlyGuard } from '../guard/demo-readonly.guard';
import { Roles } from './roles.decorator';

export function Auth(...roles: Role[]) {
  // Orden: autentica (carga request.user) → valida rol → bloquea escrituras si es demo.
  return applyDecorators(
    Roles(...roles),
    UseGuards(AuthGuard, RolesGuard, DemoReadOnlyGuard),
  );
}
