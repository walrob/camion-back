import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  RUTA_SOCKET_IO,
  TenantGateway,
} from 'src/common/tenant/tenant.gateway';

@WebSocketGateway({
  path: RUTA_SOCKET_IO,
  namespace: '/messages',
  cors: { origin: '*' },
})
export class MessagesGateway extends TenantGateway {
  @WebSocketServer()
  protected readonly server: Server;

  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  emitMessage(message: { companyId?: string }) {
    this.emitirAEmpresa(message?.companyId, 'message:new', message);
  }
}
