import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

@Entity('incident_events')
export class IncidentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  at: Date;

  @Column()
  incidentId: string;

  @ManyToOne(() => Incident, (incident) => incident.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'incidentId' })
  incident: Incident;

  @Column({ nullable: true })
  userId: string;

  // created | assigned | status_changed | comment
  @Column()
  action: string;

  @Column({ type: 'text', nullable: true })
  note: string;
}
