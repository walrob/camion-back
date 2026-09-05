import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Ruta HTTP por la que socket.io hace el handshake.
 *
 * El default de socket.io es `/socket.io`, que en producción no llega hasta
 * acá: nginx enruta por prefijo y sólo `/api/` apunta al backend, así que
 * `/socket.io/...` termina en el frontend y responde 404. El síntoma es de los
 * peores: la aplicación carga entera y bien, y lo único que no funciona es lo
 * que llega solo —alertas, incidentes y mensajes en vivo—, sin ningún error
 * que apunte a la causa.
 *
 * Al colgarlo de `/api` viaja por la misma regla de nginx que el resto de la
 * API. **El cliente tiene que declarar exactamente esta misma ruta**: si no
 * coinciden, no hay conexión.
 *
 * Es una constante y no una cadena repetida en cada gateway porque los tres
 * comparten un único servidor de socket.io: alcanza con que uno diga otra cosa
 * para que Nest levante un segundo servidor en otra ruta y ese namespace quede
 * inalcanzable.
 */
export const RUTA_SOCKET_IO = '/api/socket.io';

/** Sala de socket.io de una empresa. */
export const salaDeEmpresa = (companyId: string): string =>
  `company:${companyId}`;

/**
 * Base de los gateways de tiempo real con aislamiento por empresa.
 *
 * Antes los gateways hacían `server.emit()`, que difunde a TODOS los clientes
 * conectados al namespace. Con una sola empresa pasaba desapercibido; con varias
 * es una fuga directa: cada empresa recibiría en vivo las alertas, los incidentes
 * y los mensajes de las demás. Además la conexión no pedía credenciales, así que
 * bastaba conocer la URL para escuchar todo.
 *
 * Acá se resuelven las dos cosas:
 *
 *  - La conexión exige un JWT válido; sin él, se rechaza.
 *  - Cada cliente entra a la sala de SU empresa y las emisiones van dirigidas a
 *    esa sala, nunca al namespace completo.
 *
 * La sala de destino se deduce del `companyId` del propio payload, no de un
 * parámetro que el llamador pueda olvidar.
 */
export abstract class TenantGateway implements OnGatewayConnection {
  protected abstract readonly server: Server;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    // El token puede venir por `auth` (recomendado) o por query, para clientes
    // que no puedan usar el handshake de auth.
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (!payload?.companyId) {
        client.disconnect(true);
        return;
      }
      client.data.companyId = payload.companyId;
      client.data.userId = payload.id;
      await client.join(salaDeEmpresa(payload.companyId));
    } catch {
      client.disconnect(true);
    }
  }

  /**
   * Emite sólo a la empresa dueña del dato.
   *
   * Si el payload no trae empresa NO se difunde: es preferible perder un aviso
   * en vivo antes que mandárselo a todas las empresas.
   */
  protected emitirAEmpresa(
    companyId: string | undefined,
    evento: string,
    payload: unknown,
  ): void {
    if (!companyId) {
      this.logger.error(
        `No se emite "${evento}": el payload no trae companyId. ` +
          'Difundirlo sin empresa filtraría datos entre clientes.',
      );
      return;
    }
    this.server?.to(salaDeEmpresa(companyId)).emit(evento, payload);
  }
}
