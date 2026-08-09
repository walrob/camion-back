import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';

/**
 * Base de toda entidad que pertenece a una empresa (tenant).
 *
 * IMPORTANTE: heredar de esta clase es lo que hace que una entidad quede dentro
 * del aislamiento multi-empresa. A partir de la fase 2, el `TenantSubscriber`
 * usa esta herencia para estampar `companyId` al insertar y para verificar en
 * cada lectura que la fila pertenece a la empresa del contexto.
 *
 * Una entidad de negocio que NO herede de acá queda fuera del aislamiento: es el
 * único error capaz de provocar una fuga entre empresas. El test
 * `tenant-entities.spec.ts` recorre los metadatos de TypeORM y falla si aparece
 * una entidad sin `companyId` que no esté en la lista blanca de catálogo global.
 */
export abstract class TenantEntity {
  @Index()
  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  // RESTRICT y no CASCADE: borrar una empresa con datos tiene que fallar y
  // obligar a una baja explícita, nunca arrastrar 27 tablas en silencio.
  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId' })
  company: Company;
}
