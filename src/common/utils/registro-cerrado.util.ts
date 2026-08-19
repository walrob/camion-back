import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

/**
 * Reglas comunes de "esto ya está cerrado y no se toca".
 *
 * El sistema tiene dos clases de registro terminado y **no se tratan igual**:
 *
 *  1. **Probatorio** — checklist firmado, planilla OEA firmada. La firma es
 *     firma electrónica (Ley 25.506) y lo que la vuelve prueba es justamente
 *     que después no se pueda cambiar. No hay reapertura: si está mal, se anula
 *     y se hace una nueva.
 *  2. **De trabajo** — incidente resuelto, alerta resuelta, orden de taller
 *     hecha, liquidación cerrada. Acá cerrar no es un hecho jurídico sino una
 *     decisión operativa, y la operación real necesita poder volver atrás. Lo
 *     que no puede pasar es que se vuelva atrás **en silencio**: se reabre con
 *     motivo, con rol habilitado y queda en la auditoría.
 *
 * Estas funciones son la mitad de la regla; la otra mitad es que cada servicio
 * sepa qué significa "cerrado" para su entidad. Nada de esto vive en el front:
 * ocultar un botón no es un control.
 */

/**
 * Quiénes pueden reabrir un registro de trabajo.
 *
 * El taller y el chofer quedan afuera a propósito: cierran lo suyo, pero
 * revertir un cierre es una decisión de quien conduce la operación. La
 * liquidación es más restrictiva todavía y define su propia lista.
 */
export const ROLES_QUE_REABREN: readonly Role[] = [
  Role.ADMIN,
  Role.MANAGER,
  Role.DISPATCHER,
];

/** Un motivo más corto que esto es "asd": no sirve para auditar nada. */
const LARGO_MINIMO_DEL_MOTIVO = 5;

/**
 * Corta la operación si el registro está cerrado.
 *
 * El mensaje lo pone cada servicio porque tiene que decirle al usuario qué
 * hacer a continuación ("reabrí el incidente", "cargá una planilla nueva"), no
 * sólo que no puede.
 */
export function assertNoCerrado(estaCerrado: boolean, mensaje: string): void {
  if (estaCerrado) throw new BadRequestException(mensaje);
}

/** Corta la reapertura si el rol no está habilitado para revertir un cierre. */
export function assertPuedeReabrir(
  user: ActiveUserInterface,
  roles: readonly Role[] = ROLES_QUE_REABREN,
): void {
  if (!roles.includes(user.role as Role)) {
    throw new ForbiddenException(
      'Su rol no puede reabrir un registro ya cerrado.',
    );
  }
}

/**
 * Valida el motivo de la reapertura y lo devuelve normalizado.
 *
 * Es obligatorio: sin motivo, el registro de auditoría dice quién y cuándo,
 * que es la mitad inútil de la respuesta cuando alguien pregunta por qué un
 * incidente cerrado en marzo volvió a estar abierto en agosto.
 */
export function exigirMotivo(motivo: string | undefined, queSeReabre: string): string {
  const limpio = (motivo ?? '').trim();
  if (limpio.length < LARGO_MINIMO_DEL_MOTIVO) {
    throw new BadRequestException(
      `Indicá el motivo por el que se reabre ${queSeReabre}.`,
    );
  }
  return limpio;
}
