import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';
import { Role } from 'src/common/enums/role.enum';

/**
 * Invitación para que alguien se sume a una empresa.
 *
 * Es el flujo que reemplaza al alta manual de usuarios y el que sostiene la
 * promesa comercial de **choferes ilimitados**: si sumar un chofer costara
 * trabajo administrativo, la promesa sería teórica.
 *
 * El token es de un solo uso y con vencimiento. No se borra al usarse: queda
 * como registro de quién invitó a quién y cuándo.
 */
@Entity('invites')
export class Invite extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  /**
   * UUID que viaja en el link. Único global: es la credencial, así que no se
   * scopea por empresa. `unique` ya crea el índice; agregar `@Index()` encima
   * genera un segundo índice con el mismo nombre y rompe la migración.
   */
  @Column({ unique: true })
  token: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  /** Momento en que se aceptó. NULL = sigue pendiente. */
  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  /** Usuario que se creó al aceptarla. */
  @Column({ type: 'uuid', nullable: true })
  acceptedUserId: string | null;
}
