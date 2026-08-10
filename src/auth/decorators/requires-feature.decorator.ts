import { SetMetadata } from '@nestjs/common';
import { Feature } from 'src/common/enums/feature.enum';

export const FEATURE_KEY = 'feature';

/**
 * Declara qué feature del plan exige un endpoint.
 *
 * Normalmente no se usa suelto: `AuthFeature()` lo combina con `Auth()` para
 * garantizar el orden de los guards.
 */
export const RequiresFeature = (feature: Feature) =>
  SetMetadata(FEATURE_KEY, feature);
