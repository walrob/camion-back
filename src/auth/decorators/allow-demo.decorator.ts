import { SetMetadata } from '@nestjs/common';

export const ALLOW_DEMO_KEY = 'allowDemo';

/**
 * Marca un endpoint de escritura como permitido para cuentas demo, saltando el
 * `DemoReadOnlyGuard`. Usar con criterio: solo para acciones que no alteran datos
 * de negocio (ej. una preferencia personal). Por defecto el demo no escribe nada.
 */
export const AllowDemo = () => SetMetadata(ALLOW_DEMO_KEY, true);
