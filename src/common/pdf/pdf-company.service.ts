import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { StorageService } from 'src/common/storage/storage.service';
import { getCurrentCompanyId } from 'src/common/tenant/tenant-context';
import { PdfCompany } from './pdf-report.util';

/**
 * Tiempo que se conserva el logo descargado de S3.
 *
 * Sin caché, cada PDF genera un GET a S3 por un archivo que cambia una vez cada
 * varios meses. Diez minutos es corto para el negocio —un logo recién subido
 * aparece en el próximo reporte de la tarde— y suficiente para que una tanda de
 * comprobantes no golpee el bucket una vez por hoja.
 */
const TTL_LOGO_MS = 10 * 60 * 1000;

interface LogoCacheado {
  /** La key con la que se descargó: si cambia, el caché no aplica. */
  key: string;
  buffer?: Buffer;
  expira: number;
}

/**
 * Arma el encabezado de los comprobantes con los datos de la empresa del
 * usuario que los pide.
 *
 * Antes esto salía de variables de entorno (`COMPANY_NAME`, `COMPANY_TAX_ID`…),
 * que es la configuración de **una** instalación. En un sistema multi-empresa
 * eso significa que la liquidación de cualquier cliente sale con el membrete de
 * quien haya configurado el servidor: un documento que dice pertenecer a otra
 * empresa. Los datos ya estaban en la base —son los que el cliente carga en su
 * perfil—, así que el encabezado se toma de ahí.
 */
@Injectable()
export class PdfCompanyService {
  private readonly logger = new Logger(PdfCompanyService.name);
  private readonly cacheLogo = new Map<string, LogoCacheado>();

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly storage: StorageService,
  ) {}

  /**
   * Datos de membrete de una empresa.
   *
   * Por defecto, la del contexto del request. El parámetro explícito existe
   * para los reportes que no nacen de un request —un cron de envíos
   * programados— donde el contexto lo abre el propio proceso.
   */
  async encabezado(
    companyId: string | undefined = getCurrentCompanyId(),
  ): Promise<PdfCompany> {
    if (!companyId) {
      // Deliberadamente un error y no un valor por defecto: un comprobante con
      // el membrete equivocado es peor que un comprobante que no sale. El
      // primero se archiva y se manda al cliente sin que nadie lo note.
      throw new Error(
        'No hay empresa en contexto: no se puede armar el encabezado del PDF.',
      );
    }

    const company = await this.companies.findOne({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        cuit: true,
        address: true,
        city: true,
        state: true,
        phone: true,
        invoiceEmail: true,
        invoiceCuit: true,
        logoUrl: true,
      },
    });

    if (!company) {
      throw new Error(`La empresa ${companyId} no existe.`);
    }

    // `cuit` es el de la empresa; `invoiceCuit` el de facturación, que suele ser
    // el mismo y a veces es lo único cargado.
    const cuit = company.cuit || company.invoiceCuit || '';

    return {
      name: company.name,
      taxId: cuit ? `CUIT ${cuit}` : '',
      address: [company.address, company.city, company.state]
        .filter(Boolean)
        .join(', '),
      contact: [company.phone, company.invoiceEmail]
        .filter(Boolean)
        .join('  ·  '),
      logo: await this.logo(company.id, company.logoUrl),
    };
  }

  /**
   * Logo de la empresa, si tiene uno cargado.
   *
   * `logoUrl` es, pese al nombre, la **key** de S3 que devolvió la subida (ver
   * `CompaniesController.subirLogo`), no una URL.
   *
   * Un fallo bajando el archivo no interrumpe el comprobante: se registra y el
   * encabezado cae al recuadro con las iniciales. Que S3 no responda no es
   * motivo para que un chofer se quede sin su hoja de ruta.
   */
  private async logo(
    companyId: string,
    key?: string | null,
  ): Promise<Buffer | undefined> {
    if (!key) return undefined;

    const cacheado = this.cacheLogo.get(companyId);
    if (cacheado && cacheado.key === key && cacheado.expira > Date.now()) {
      return cacheado.buffer;
    }

    let buffer: Buffer | undefined;
    try {
      buffer = await this.storage.getFileBuffer(key);
    } catch (error) {
      this.logger.warn(
        `No se pudo descargar el logo de la empresa ${companyId} (${key}): ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          'El comprobante sale con el recuadro de iniciales.',
      );
    }

    // Se cachea también el fallo: si el archivo no está, no tiene sentido
    // reintentar la descarga en cada hoja de un reporte de cuarenta páginas.
    this.cacheLogo.set(companyId, {
      key,
      buffer,
      expira: Date.now() + TTL_LOGO_MS,
    });

    return buffer;
  }
}
