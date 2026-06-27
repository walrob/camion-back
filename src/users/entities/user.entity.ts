import { Role } from 'src/common/enums/role.enum';
import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class User {
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

  @Column({ unique: true, nullable: false })
  email: string;

  @Column()
  name: string;

  @Column({ nullable: false, select: false })
  password: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: false })
  isTemplateDark: boolean;

  @Column({ type: 'enum', enum: Role, default: Role.DRIVER })
  role: Role;

  @Column({ default: false })
  blocked: Boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastConnection: Date;
}
