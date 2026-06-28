import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeviceToken } from './entities/device-token.entity';

/**
 * Servicio de notificaciones push.
 *
 * SCAFFOLD: registra device tokens y deja listo el envío. El envío real por FCM
 * requiere credenciales de Firebase (ver FCM_* en .env) y se completa en producción.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokensRepository: Repository<DeviceToken>,
  ) {}

  async register(userId: string, token: string, platform?: string) {
    const existing = await this.tokensRepository.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      if (platform) existing.platform = platform;
      return this.tokensRepository.save(existing);
    }
    return this.tokensRepository.save(
      this.tokensRepository.create({ userId, token, platform }),
    );
  }

  async unregister(token: string) {
    await this.tokensRepository.delete({ token });
    return { token };
  }

  async sendToUser(userId: string, title: string, body: string) {
    const tokens = await this.tokensRepository.find({ where: { userId } });
    return this.dispatch(tokens.map((t) => t.token), title, body);
  }

  async sendToUsers(userIds: string[], title: string, body: string) {
    if (!userIds.length) return;
    const tokens = await this.tokensRepository.find({
      where: { userId: In(userIds) },
    });
    return this.dispatch(tokens.map((t) => t.token), title, body);
  }

  private dispatch(tokens: string[], title: string, body: string) {
    if (!tokens.length) return;
    // TODO: integrar firebase-admin y enviar el payload real.
    this.logger.log(`(push) "${title}" -> ${tokens.length} dispositivos`);
  }
}
