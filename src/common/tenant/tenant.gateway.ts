import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

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
