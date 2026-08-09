import { Role } from 'src/common/enums/role.enum';
import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from 'src/common/entities/tenant.entity';

@Entity()
export class User extends TenantEntity {
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

  /**
   * Único GLOBAL, no por empresa (decisión D1 del plan de conversión a SaaS).
   * Un usuario pertenece a UNA empresa por vez.
   *
   * Consecuencia asumida: si una persona deja la empresa A y entra a la B con
   * el mismo email, NO se da de alta un usuario nuevo — se reasigna el
   * existente cambiándole `companyId`. Así el histórico de la empresa A
   * (`createdBy`, viajes, rendiciones) sigue apuntando a un usuario válido.
   * La reasignación es una operación de superadmin: un admin de la empresa B no
   * debe poder reclamar el email de otra empresa por su cuenta.
   */
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

  /**
   * Usuario activo en la empresa actual (decisión D1).
   *
   * Es distinto de `blocked` (que es una sanción) y de `deletedAt` (que es una
   * baja lógica): `isActive: false` es el estado normal de quien ya no trabaja
   * en la empresa pero cuyo registro se conserva para que el histórico siga
   * teniendo a quién apuntar.
   */
  @Column({ default: true })
  isActive: boolean;

  /**
   * Cuenta de demostración de solo lectura (para mostrar el sistema a clientes).
   * Puede ver todo y descargar PDFs, pero no puede modificar datos: el
   * `DemoReadOnlyGuard` bloquea toda escritura (POST/PATCH/PUT/DELETE).
   */
  @Column({ default: false })
  isDemo: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastConnection: Date;
}
