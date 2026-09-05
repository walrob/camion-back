import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  RUTA_SOCKET_IO,
  TenantGateway,
} from 'src/common/tenant/tenant.gateway';

/**
 * Empuja incidentes en vivo al tablero del backoffice.
 * El front se suscribe al namespace /incidents con su token.
 */
@WebSocketGateway({
  path: RUTA_SOCKET_IO,
  namespace: '/incidents',
  cors: { origin: '*' },
})
export class IncidentsGateway extends TenantGateway {
  @WebSocketServer()
  protected readonly server: Server;

  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  emitNew(incident: { companyId?: string }) {
    this.emitirAEmpresa(incident?.companyId, 'incident:new', incident);
  }

  emitUpdate(incident: { companyId?: string }) {
    this.emitirAEmpresa(incident?.companyId, 'incident:update', incident);
  }
}
