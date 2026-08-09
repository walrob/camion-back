import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { TenantGateway } from 'src/common/tenant/tenant.gateway';

@WebSocketGateway({ namespace: '/alerts', cors: { origin: '*' } })
export class AlertsGateway extends TenantGateway {
  @WebSocketServer()
  protected readonly server: Server;

  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  emitNew(alert: { companyId?: string }) {
    this.emitirAEmpresa(alert?.companyId, 'alert:new', alert);
  }

  emitUpdate(alert: { companyId?: string }) {
    this.emitirAEmpresa(alert?.companyId, 'alert:update', alert);
  }
}
