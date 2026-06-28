import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Umbrales configurables del motor de alertas (key/value). */
@Entity('alert_rule_configs')
export class AlertRuleConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ unique: true })
  key: string;

  @Column()
  value: string;

  @Column({ default: true })
  enabled: boolean;
}
