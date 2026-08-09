import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { TenantGateway } from 'src/common/tenant/tenant.gateway';

@WebSocketGateway({ namespace: '/messages', cors: { origin: '*' } })
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
