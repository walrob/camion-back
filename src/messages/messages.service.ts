import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { SendMessageDto } from './dto/send-message.dto';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    private readonly gateway: MessagesGateway,
  ) {}

  async send(dto: SendMessageDto, user: ActiveUserInterface): Promise<Message> {
    const message = await this.messagesRepository.save(
      this.messagesRepository.create({
        body: dto.body,
        fromUserId: user.id,
        toUserId: dto.toUserId,
        toRole: dto.toRole ?? (dto.toUserId ? undefined : 'dispatcher'),
        tripId: dto.tripId,
      }),
    );
    this.gateway.emitMessage(message);
    // TODO (10.2): push FCM al destinatario si está offline.
    return message;
  }

  /** Hilo del chofer: todos los mensajes en los que participa. */
  threadForUser(userId: string): Promise<Message[]> {
    return this.messagesRepository.find({
      where: [{ fromUserId: userId }, { toUserId: userId }],
      order: { createdAt: 'ASC' },
    });
  }

  /** Conversación entre el usuario actual (staff) y un chofer. */
  conversation(
    meId: string,
    otherId: string,
    myRole: string,
  ): Promise<Message[]> {
    return this.messagesRepository
      .createQueryBuilder('m')
      .where(
        new Brackets((qb) => {
          qb.where('m.fromUserId = :meId AND m.toUserId = :otherId', {
            meId,
            otherId,
          }).orWhere(
            'm.fromUserId = :otherId AND (m.toUserId = :meId OR m.toRole = :myRole)',
            { otherId, meId, myRole },
          );
        }),
      )
      .orderBy('m.createdAt', 'ASC')
      .getMany();
  }

  /**
   * Bandeja del backoffice: mensajes en los que participo, ya sea recibidos
   * (a mí o a mi rol) o enviados por mí. Incluir los enviados permite ver una
   * conversación que inicié aunque el chofer todavía no haya respondido.
   */
  inbox(meId: string, myRole: string): Promise<Message[]> {
    return this.messagesRepository.find({
      where: [{ toUserId: meId }, { toRole: myRole }, { fromUserId: meId }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async markRead(id: string): Promise<Message> {
    const message = await this.messagesRepository.findOne({ where: { id } });
    if (!message) throw new NotFoundException('Mensaje no encontrado.');
    message.readAt = new Date();
    return this.messagesRepository.save(message);
  }
}
