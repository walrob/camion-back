import {
  Prepago,
  calcularPrecioMensual,
  calcularProrrateo,
  calcularUnidadesEquivalentes,
  type AddonFacturable,
  type PlanFacturable,
  type UnidadesFacturables,
} from './pricing.util';

/**
 * La fórmula de precio es lo único del sistema que decide cuánto se le cobra a
 * un cliente. Los casos de abajo salen de `MODELO-COMERCIAL.md` §9.1: si alguno
 * falla, el motor está facturando distinto de lo que dice la propuesta
 * comercial firmada.
 */

const CONTROL: PlanFacturable = {
  baseFee: 59000,
  pricePerVehicle: 7900,
  minVehicles: 3,
};
const OPERACION: PlanFacturable = {
  baseFee: 129000,
  pricePerVehicle: 12900,
  minVehicles: 5,
};
const GESTION: PlanFacturable = {
  baseFee: 249000,
  pricePerVehicle: 18900,
  minVehicles: 8,
};

const soloCamiones = (n: number): UnidadesFacturables => ({
  activeTrucks: n,
  inactiveTrucks: 0,
  activeTrailers: 0,
  inactiveTrailers: 0,
});

describe('Precio mensual — clientes tipo del modelo comercial', () => {
  it('Cliente A: fletero de 4 camiones en Control → $ 90.600', () => {
    const r = calcularPrecioMensual(CONTROL, soloCamiones(4));
    expect(r.amount).toBe(90600); // 59.000 + 4 × 7.900
  });

  it('Cliente B: PyME de 12 camiones en Operación → $ 283.800', () => {
    const r = calcularPrecioMensual(OPERACION, soloCamiones(12));
    expect(r.amount).toBe(283800); // 129.000 + 12 × 12.900
    expect(r.baseAmount).toBe(129000);
    expect(r.vehiclesAmount).toBe(154800);
  });

  it('Cliente C: 30 camiones en Gestión + GPS → $ 963.000', () => {
    const gps: AddonFacturable = {
      code: 'gps',
      name: 'GPS / telemetría',
      monthlyPrice: 0,
      pricePerVehicle: 4900,
    };
    const r = calcularPrecioMensual(GESTION, soloCamiones(30), [gps]);
    expect(r.amount).toBe(963000); // 249.000 + 567.000 + 147.000
  });

  it('Cliente D: 80 camiones en Gestión + ERP + IA + API + Premium → $ 2.449.000', () => {
    const addons: AddonFacturable[] = [
      { code: 'erp', name: 'Integración ERP', monthlyPrice: 89000, pricePerVehicle: 0 },
      { code: 'ia', name: 'FleetLog IA', monthlyPrice: 149000, pricePerVehicle: 1900 },
      { code: 'api', name: 'API + Webhooks', monthlyPrice: 119000, pricePerVehicle: 0 },
      { code: 'premium', name: 'Soporte Premium', monthlyPrice: 179000, pricePerVehicle: 0 },
    ];
    const r = calcularPrecioMensual(GESTION, soloCamiones(80), addons);

    expect(r.baseAmount).toBe(249000);
    expect(r.vehiclesAmount).toBe(1512000);
    expect(r.addonsAmount).toBe(688000); // 89.000 + 301.000 + 119.000 + 179.000
    expect(r.amount).toBe(2449000);
  });
});

describe('Mínimo de vehículos del plan', () => {
  it('una empresa por debajo del mínimo paga por el mínimo', () => {
    // 4 camiones en Gestión (mínimo 8): 249.000 + 8 × 18.900
    const r = calcularPrecioMensual(GESTION, soloCamiones(4));
    expect(r.billedTrucks).toBe(8);
    expect(r.amount).toBe(400200);
  });

  it('por encima del mínimo se cobra lo real', () => {
    const r = calcularPrecioMensual(GESTION, soloCamiones(10));
    expect(r.billedTrucks).toBe(10);
  });

  it('D3: los acoplados NO ayudan a alcanzar el mínimo', () => {
    // 2 camiones + 10 acoplados en Control (mínimo 3 camiones).
    const unidades: UnidadesFacturables = {
      activeTrucks: 2,
      inactiveTrucks: 0,
      activeTrailers: 10,
      inactiveTrailers: 0,
    };
    const { billedTrucks, billedUnits } = calcularUnidadesEquivalentes(
      CONTROL,
      unidades,
    );

    // El mínimo eleva los camiones de 2 a 3; los acoplados suman aparte al 50 %.
    expect(billedTrucks).toBe(3);
    expect(billedUnits).toBe(8); // 3 + 10 × 0,5
  });
});

describe('Acoplados y modo inactivo', () => {
  it('el acoplado factura al 50 %', () => {
    const r = calcularPrecioMensual(OPERACION, {
      activeTrucks: 10,
      inactiveTrucks: 0,
      activeTrailers: 4,
      inactiveTrailers: 0,
    });
    // 129.000 + (10 + 4×0,5) × 12.900 = 129.000 + 154.800
    expect(r.billedUnits).toBe(12);
    expect(r.amount).toBe(283800);
  });

  it('el camión inactivo factura al 30 %', () => {
    const r = calcularPrecioMensual(OPERACION, {
      activeTrucks: 10,
      inactiveTrucks: 5,
      activeTrailers: 0,
      inactiveTrailers: 0,
    });
    // 10 + 5×0,3 = 11,5 unidades
    expect(r.billedUnits).toBe(11.5);
    expect(r.amount).toBe(277350); // 129.000 + 11,5 × 12.900
  });

  it('el acoplado inactivo factura al 15 % (50 % × 30 %)', () => {
    const { billedUnits } = calcularUnidadesEquivalentes(OPERACION, {
      activeTrucks: 10,
      inactiveTrucks: 0,
      activeTrailers: 0,
      inactiveTrailers: 4,
    });
    expect(billedUnits).toBe(10.6); // 10 + 4 × 0,15
  });

  it('el modo inactivo es más barato que dar de baja y volver a dar de alta', () => {
    const activo = calcularPrecioMensual(OPERACION, soloCamiones(10));
    const conInactivos = calcularPrecioMensual(OPERACION, {
      activeTrucks: 8,
      inactiveTrucks: 2,
      activeTrailers: 0,
      inactiveTrailers: 0,
    });
    expect(conInactivos.amount).toBeLessThan(activo.amount);
  });
});

describe('Descuentos por prepago (§7.4)', () => {
  it('anual descuenta 15 %', () => {
    const r = calcularPrecioMensual(
      OPERACION,
      soloCamiones(12),
      [],
      Prepago.ANUAL,
    );
    expect(r.discount).toBe(42570); // 283.800 × 0,15
    expect(r.amount).toBe(241230);
  });

  it('bianual descuenta 22 %', () => {
    const r = calcularPrecioMensual(
      OPERACION,
      soloCamiones(12),
      [],
      Prepago.BIANUAL,
    );
    expect(r.discount).toBe(62436);
    expect(r.amount).toBe(221364);
  });

  it('el descuento también alcanza a los add-ons', () => {
    const addon: AddonFacturable = {
      code: 'erp', name: 'ERP', monthlyPrice: 89000, pricePerVehicle: 0,
    };
    const r = calcularPrecioMensual(
      OPERACION,
      soloCamiones(12),
      [addon],
      Prepago.ANUAL,
    );
    expect(r.discount).toBe(55920); // (283.800 + 89.000) × 0,15
  });
});

describe('Add-ons con parte variable', () => {
  it('la parte por vehículo usa los camiones facturados, no las unidades equivalentes', () => {
    // Un GPS se instala en un camión, no en medio acoplado.
    const gps: AddonFacturable = {
      code: 'gps', name: 'GPS', monthlyPrice: 0, pricePerVehicle: 4900,
    };
    const r = calcularPrecioMensual(
      OPERACION,
      { activeTrucks: 10, inactiveTrucks: 0, activeTrailers: 6, inactiveTrailers: 0 },
      [gps],
    );
    expect(r.addonsAmount).toBe(49000); // 10 × 4.900, no 13 × 4.900
  });

  it('respeta la cantidad contratada', () => {
    const storage: AddonFacturable = {
      code: 'storage', name: 'Almacenamiento', monthlyPrice: 5900, pricePerVehicle: 0, quantity: 2,
    };
    const r = calcularPrecioMensual(CONTROL, soloCamiones(5), [storage]);
    expect(r.addonsAmount).toBe(11800);
  });
});

describe('Prorrateo de cambios a mitad de período', () => {
  it('cobra sólo los días que faltan hasta el cierre', () => {
    const r = calcularProrrateo({
      precioAnterior: 283800,
      precioNuevo: 400200,
      fechaCambio: new Date('2026-08-16T00:00:00'),
      periodEnd: new Date('2026-08-31T00:00:00'),
      diasDelPeriodo: 31,
    });
    // Diferencia 116.400 × 15/31
    expect(r.diasRestantes).toBe(15);
    expect(r.importe).toBe(56322.58);
  });

  it('un cambio el último día no genera cargo relevante', () => {
    const r = calcularProrrateo({
      precioAnterior: 283800,
      precioNuevo: 400200,
      fechaCambio: new Date('2026-08-31T00:00:00'),
      periodEnd: new Date('2026-08-31T00:00:00'),
      diasDelPeriodo: 31,
    });
    expect(r.diasRestantes).toBe(0);
    expect(r.importe).toBe(0);
  });

  it('un cambio que abarata da negativo y se puede detectar', () => {
    // Los downgrades se difieren a la renovación (§6.4). Si aparece un negativo
    // es que alguien aplicó uno en el acto: hay que verlo, no facturarlo.
    const r = calcularProrrateo({
      precioAnterior: 400200,
      precioNuevo: 283800,
      fechaCambio: new Date('2026-08-16T00:00:00'),
      periodEnd: new Date('2026-08-31T00:00:00'),
      diasDelPeriodo: 31,
    });
    expect(r.importe).toBeLessThan(0);
  });
});

describe('Redondeo (R5.3)', () => {
  it('los factores 0,5 y 0,3 no dejan más de dos decimales en el importe', () => {
    const r = calcularPrecioMensual(CONTROL, {
      activeTrucks: 7,
      inactiveTrucks: 3,
      activeTrailers: 5,
      inactiveTrailers: 3,
    });
    const decimales = (r.amount.toString().split('.')[1] ?? '').length;
    expect(decimales).toBeLessThanOrEqual(2);
  });
});
