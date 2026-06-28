import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/alerts', cors: { origin: '*' } })
export class AlertsGateway {
  @WebSocketServer()
  server: Server;

  emitNew(alert: any) {
    this.server?.emit('alert:new', alert);
  }

  emitUpdate(alert: any) {
    this.server?.emit('alert:update', alert);
  }
}
