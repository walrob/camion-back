import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  // Mensaje directo a un usuario (chofer) o a un rol (p. ej. dispatcher).
  @Column({ nullable: true })
  toUserId: string;

  @Column({ nullable: true })
  toRole: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;
}
