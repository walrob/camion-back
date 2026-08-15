import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

/**
 * Límite de llamadas de toda la aplicación.
 *
 * Se registra como `APP_GUARD` en `AppModule`. **Ese registro es el arreglo**:
 * `ThrottlerModule.forRoot()` configura la librería pero no la engancha a nada,
 * así que hasta ahora los `@Throttle(...)` de las fases 6 y 9 estaban declarados
 * y no corrían. Quedaban sin efecto, entre otros, el freno al alta pública de
 * empresas —que es la mitigación de R6.1— y el del webhook de Mercado Pago, que
 * es un endpoint público.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Qué se cuenta.
   *
   * Con sesión, el token; sin sesión, la IP. La distinción no es un detalle:
   *
   *  - **Contar por IP a los usuarios autenticados sería un error.** Una oficina
   *    de diez personas sale a internet por una sola IP pública, así que
   *    compartirían el balde y se cortarían entre ellas. Con el token, cada
   *    sesión tiene el suyo.
   *  - **Contar por token a los anónimos sería inútil**, porque justamente no
   *    tienen: el login, el alta de empresas y el webhook de MP son los casos en
   *    que limitar por IP es lo correcto, y son los que R6.1 quiere frenar.
   *
   * El token no se usa crudo sino su SHA-256 recortado: la clave del throttler
   * termina en memoria y en los mensajes de diagnóstico, y una credencial válida
   * no tiene por qué estar ahí. Alcanza con que sea estable y distinto por
   * sesión, no con que sea reversible.
   *
   * No hace falta verificar la firma del token para esto. Un token inventado
   * genera su propio balde y de todos modos lo rechaza `AuthGuard` un paso
   * después; lo único que se le pide acá es identificar al que llama.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const [tipo, valor] = req?.headers?.authorization?.split(' ') ?? [];

    if (tipo === 'Bearer' && valor) {
      const huella = createHash('sha256')
        .update(valor)
        .digest('base64url')
        .slice(0, 32);
      return `sesion:${huella}`;
    }

    return `ip:${req?.ip ?? 'desconocida'}`;
  }

  /**
   * Se apaga con `THROTTLE_ENABLED=false`.
   *
   * Existe por los tests de integración: los 104 casos e2e corren seguidos
   * contra la misma instancia, muchos sin token —el login mismo tiene un límite
   * de 20 cada 10 minutos—, y superarían cualquier techo razonable. Un test que
   * falla por el rate limit no dice nada sobre lo que estaba probando; sólo
   * enseña a desconfiar de los rojos.
   */
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return process.env.THROTTLE_ENABLED === 'false';
  }
}
