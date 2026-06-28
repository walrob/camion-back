import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/messages', cors: { origin: '*' } })
export class MessagesGateway {
  @WebSocketServer()
  server: Server;

  emitMessage(message: any) {
    this.server?.emit('message:new', message);
  }
}
