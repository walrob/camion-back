import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('messages')
@Index(['fromUserId', 'toUserId'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  @Column({ nullable: true })
  tripId: string;

  @Column()
  fromUserId: string;

  // Relaciones solo de lectura: permiten que la bandeja/conversación devuelvan
  // el nombre del interlocutor sin que el front tenga que traerse el padrón de
  // usuarios para resolver IDs. Se seleccionan campos puntuales (id/name/role).
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'fromUserId' })
  fromUser?: User;

  // Mensaje directo a un usuario (chofer) o a un rol (p. ej. dispatcher).
  @Column({ nullable: true })
  toUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'toUserId' })
  toUser?: User;

  @Column({ nullable: true })
  toRole: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;
}
