import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';

/** Umbrales configurables del motor de alertas (key/value). */
// Cada empresa configura sus propios umbrales: la clave es única por empresa.
@Entity('alert_rule_configs')
@Unique('UQ_alert_rule_configs_company_key', ['companyId', 'key'])
export class AlertRuleConfig extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  key: string;

  @Column()
  value: string;

  @Column({ default: true })
  enabled: boolean;
}
