import { CompanyStatus } from '../enums/companyStatus.enum';

export interface ActiveUserInterface {
  id: string;
  /** Empresa (tenant) a la que pertenece el usuario. Es el eje del aislamiento. */
  companyId: string;
  role: string;
  /**
   * Estado comercial de la empresa al momento de emitir el token.
   *
   * Ojo: queda congelado hasta que el token expira. Sirve para avisos, no para
   * decidir accesos críticos — eso se resuelve contra la base (fases 6 y 9).
   */
  status?: CompanyStatus;
  isDemo?: boolean;
}
