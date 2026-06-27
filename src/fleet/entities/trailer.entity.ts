import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TrailerStatus } from 'src/common/enums/trailerStatus.enum';

@Entity('trailers')
export class Trailer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  updatedBy: string;

  @DeleteDateColumn()
  deletedAt: Date;

  @Column({ nullable: true })
  deletedBy: string;

  @Column({ unique: true })
  plate: string;

  @Column({ nullable: true })
  type: string;

  @Column({ type: 'int', nullable: true })
  loadCapacityKg: number;

  @Column({
    type: 'enum',
    enum: TrailerStatus,
    default: TrailerStatus.AVAILABLE,
  })
  status: TrailerStatus;

  @Column({ default: true })
  isActive: boolean;
}
