import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Empuja incidentes en vivo al tablero del backoffice.
 * El front se suscribe al namespace /incidents.
 */
@WebSocketGateway({ namespace: '/incidents', cors: { origin: '*' } })
export class IncidentsGateway {
  @WebSocketServer()
  server: Server;

  emitNew(incident: any) {
    this.server?.emit('incident:new', incident);
  }

  emitUpdate(incident: any) {
    this.server?.emit('incident:update', incident);
  }
}
