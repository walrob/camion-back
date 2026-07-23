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

  /**
   * Base de consulta con el interlocutor resuelto. Selecciona solo id/name/role
   * de cada usuario: alcanza para pintar la conversación en el front y evita
   * exponer email/teléfono//perfil de gente con la que solo se chatea.
   *
   * Sin esto el front tendría que traerse el padrón entero de usuarios para
   * traducir `fromUserId`/`toUserId` a nombres.
   */
  private withParticipants() {
    return this.messagesRepository
      .createQueryBuilder('m')
      .leftJoin('m.fromUser', 'fromUser')
      .addSelect(['fromUser.id', 'fromUser.name', 'fromUser.role'])
      .leftJoin('m.toUser', 'toUser')
      .addSelect(['toUser.id', 'toUser.name', 'toUser.role']);
  }

  /** Hilo del chofer: todos los mensajes en los que participa. */
  threadForUser(userId: string): Promise<Message[]> {
    return this.withParticipants()
      .where(
        new Brackets((qb) => {
          qb.where('m.fromUserId = :userId', { userId }).orWhere(
            'm.toUserId = :userId',
            { userId },
          );
        }),
      )
      .orderBy('m.createdAt', 'ASC')
      .getMany();
  }

  /** Conversación entre el usuario actual (staff) y un chofer. */
  conversation(
    meId: string,
    otherId: string,
    myRole: string,
  ): Promise<Message[]> {
    return this.withParticipants()
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
    return this.withParticipants()
      .where(
        new Brackets((qb) => {
          qb.where('m.toUserId = :meId', { meId })
            .orWhere('m.toRole = :myRole', { myRole })
            .orWhere('m.fromUserId = :meId', { meId });
        }),
      )
      .orderBy('m.createdAt', 'DESC')
      .take(100)
      .getMany();
  }

  async markRead(id: string): Promise<Message> {
    const message = await this.messagesRepository.findOne({ where: { id } });
    if (!message) throw new NotFoundException('Mensaje no encontrado.');
    message.readAt = new Date();
    return this.messagesRepository.save(message);
  }
}
