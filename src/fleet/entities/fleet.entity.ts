import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Truck } from './truck.entity';
import { TenantEntity } from 'src/common/entities/tenant.entity';

// El código de agrupación de flota es único DENTRO de cada empresa.
@Entity('fleets')
@Unique('UQ_fleets_company_code', ['companyId', 'code'])
export class Fleet extends TenantEntity {
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

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Truck, (truck) => truck.fleet)
  trucks: Truck[];
}
