import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';

@Entity('device_tokens')
export class DeviceToken extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  userId: string;

  /**
   * Único GLOBAL a propósito: el token de push identifica a un dispositivo, y un
   * mismo celular no puede estar registrado en dos empresas a la vez. Si el
   * dispositivo pasa a otra empresa, el alta vuelve a escribir la fila existente
   * y le reasigna `companyId` en lugar de crear una segunda.
   */
  @Column({ unique: true })
  token: string;

  @Column({ nullable: true })
  platform: string;
}
