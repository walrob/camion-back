import { NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Subscription } from './entities/subscription.entity';

/**
 * Comprobante de un período: carga, baja y descarga.
 *
 * Lo que se protege acá es el aislamiento: los tres métodos buscan el período
 * **por id y por empresa**, y el endpoint del superadmin recibe las dos cosas
 * por la URL. Si alguno filtrara sólo por id, pegarle con el id de un período
 * de otra empresa dejaría subirle —o bajarle— la factura a un cliente ajeno,
 * que es la peor falla posible en un panel de plataforma.
 *
 * El servicio se instancia por prototipo en lugar de armar el módulo de Nest: de
 * las trece dependencias de `BillingService` estos métodos usan una sola, y un
 * `TestingModule` completo probaría el cableado en vez de la lógica.
 */
describe('BillingService · comprobantes', () => {
  const PERIODO: Partial<Subscription> = {
    id: 'sub-1',
    companyId: 'company-1',
    periodStart: '2026-03-01' as unknown as Date,
    invoiceKey: null!,
    invoiceNumber: null!,
    invoiceUploadedAt: null,
  };

  let repo: { findOne: jest.Mock; save: jest.Mock };
  let service: BillingService;

  const armar = (periodo: Partial<Subscription> | null = { ...PERIODO }) => {
    repo = {
      // Sólo devuelve el período cuando el `where` trae la empresa correcta:
      // así el test falla de verdad si alguien saca el `companyId` del filtro.
      findOne: jest.fn(async ({ where }: any) =>
        periodo && where.id === periodo.id && where.companyId === periodo.companyId
          ? periodo
          : null,
      ),
      save: jest.fn(async (s: any) => s),
    };
    service = Object.create(BillingService.prototype) as BillingService;
    (service as any).subscriptionsRepository = repo;
    return periodo;
  };

  beforeEach(() => armar());

  describe('guardarComprobante', () => {
    it('guarda la key, el número y la fecha de carga', async () => {
      const antes = Date.now();
      const sub = await service.guardarComprobante('company-1', 'sub-1', {
        invoiceKey: 'invoices/abc.pdf',
        invoiceNumber: '0001-00001234',
      });

      expect(sub.invoiceKey).toBe('invoices/abc.pdf');
      expect(sub.invoiceNumber).toBe('0001-00001234');
      expect(sub.invoiceUploadedAt!.getTime()).toBeGreaterThanOrEqual(antes);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('deja el número sin tocar si no se manda', async () => {
      const periodo = armar({ ...PERIODO, invoiceNumber: '0001-00000001' })!;
      await service.guardarComprobante('company-1', 'sub-1', {
        invoiceKey: 'invoices/nueva.pdf',
      });
      expect(periodo.invoiceNumber).toBe('0001-00000001');
    });

    it('limpia el número si llega vacío', async () => {
      const periodo = armar({ ...PERIODO, invoiceNumber: '0001-00000001' })!;
      await service.guardarComprobante('company-1', 'sub-1', {
        invoiceKey: 'invoices/nueva.pdf',
        invoiceNumber: '',
      });
      expect(periodo.invoiceNumber).toBeNull();
    });

    it('no escribe el período de otra empresa', async () => {
      await expect(
        service.guardarComprobante('company-2', 'sub-1', {
          invoiceKey: 'invoices/abc.pdf',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('quitarComprobante', () => {
    it('borra el vínculo pero no toca el archivo en S3', async () => {
      const periodo = armar({
        ...PERIODO,
        invoiceKey: 'invoices/abc.pdf',
        invoiceNumber: '0001-00001234',
        invoiceUploadedAt: new Date(),
      })!;

      const sub = await service.quitarComprobante('company-1', 'sub-1');

      expect(sub.invoiceKey).toBeNull();
      expect(sub.invoiceNumber).toBeNull();
      expect(sub.invoiceUploadedAt).toBeNull();
      // El servicio no conoce S3: quien sube es el controlador, y nadie borra.
      expect(periodo).toBe(sub);
    });

    it('no toca el período de otra empresa', async () => {
      armar({ ...PERIODO, invoiceKey: 'invoices/abc.pdf' });
      await expect(
        service.quitarComprobante('company-2', 'sub-1'),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('keyDelComprobante', () => {
    it('devuelve la key y un nombre con el período y el número', async () => {
      armar({
        ...PERIODO,
        invoiceKey: 'invoices/abc.pdf',
        invoiceNumber: '0001-00001234',
      });

      await expect(
        service.keyDelComprobante('company-1', 'sub-1'),
      ).resolves.toEqual({
        key: 'invoices/abc.pdf',
        nombre: 'factura-2026-03-0001-00001234.pdf',
      });
    });

    it('sin número, el nombre queda con el período solo', async () => {
      armar({ ...PERIODO, invoiceKey: 'invoices/abc.pdf' });
      const { nombre } = await service.keyDelComprobante('company-1', 'sub-1');
      expect(nombre).toBe('factura-2026-03.pdf');
    });

    it('avisa cuando el período todavía no tiene comprobante', async () => {
      await expect(
        service.keyDelComprobante('company-1', 'sub-1'),
      ).rejects.toThrow(/todavía no tiene comprobante/);
    });

    it('no entrega el comprobante de otra empresa', async () => {
      armar({ ...PERIODO, invoiceKey: 'invoices/abc.pdf' });
      await expect(
        service.keyDelComprobante('company-2', 'sub-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
