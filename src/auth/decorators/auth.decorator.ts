import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthGuard } from '../guard/auth.guard';
import { RolesGuard } from '../guard/roles.guard';
import { DemoReadOnlyGuard } from '../guard/demo-readonly.guard';
import { Roles } from './roles.decorator';
import { Feature } from '../../common/enums/feature.enum';
import { FeatureGuard } from '../guard/feature.guard';
import { RequiresFeature } from './requires-feature.decorator';

export function Auth(...roles: Role[]) {
  // Orden: autentica (carga request.user) → valida rol → valida plan → bloquea
  // escrituras si es demo.
  //
  // FeatureGuard va acá y no a nivel de clase por el orden en que Nest corre los
  // guards: los de clase corren ANTES que los de método, así que un
  // `@UseGuards(FeatureGuard)` en el controlador se ejecutaría antes que
  // AuthGuard y no tendría `request.user`. Al ir dentro de Auth() queda después
  // de la autenticación y alcanza con declarar `@RequiresFeature()` en la clase.
  //
  // Si el endpoint no declara feature, FeatureGuard devuelve true de inmediato.
  return applyDecorators(
    Roles(...roles),
    UseGuards(AuthGuard, RolesGuard, FeatureGuard, DemoReadOnlyGuard),
  );
}

/**
 * Igual que `Auth()`, pero además exige que el plan de la empresa incluya la
 * feature.
 *
 * Se declara compuesto para fijar el orden de los guards: `AuthGuard` corre
 * primero y deja `request.user` —con su `companyId`— disponible para que
 * `FeatureGuard` pueda resolver el plan.
 *
 *   @AuthFeature(Feature.SETTLEMENTS, Role.ADMIN, Role.MANAGER)
 */
export function AuthFeature(feature: Feature, ...roles: Role[]) {
  return applyDecorators(
    RequiresFeature(feature),
    Roles(...roles),
    UseGuards(AuthGuard, RolesGuard, FeatureGuard, DemoReadOnlyGuard),
  );
}
