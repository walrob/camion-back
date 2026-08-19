/**
 * Cálculo del precio mensual de una empresa.
 *
 * Función pura y sin dependencias: es el corazón económico del producto y tiene
 * que poder probarse sin base de datos. Todo lo que decide cuánto se le cobra a
 * un cliente vive acá.
 *
 * Reglas, todas de `MODELO-COMERCIAL.md`:
 *
 *   §7.2  Tarifa PLANA por vehículo. Sin tramos ni escalones de volumen: la
 *         compresión por tamaño la produce el abono base al repartirse entre
 *         más unidades.
 *   §2.4  Acoplado = 50 % de la tarifa por vehículo.
 *   §2.3  Modo inactivo = 30 % de la tarifa que le corresponda a esa unidad.
 *   §7.4  Prepago anual −15 %, bianual −22 %.
 *
 * **Sin mínimo de vehículos.** Los planes tenían un piso facturable (3/5/8/25)
 * que obligaba a explicar en la factura por qué se cobraban camiones que la
 * empresa no tenía. Se quitó: se factura lo que hay. La compresión por tamaño
 * la sigue produciendo el abono base al repartirse entre más unidades.
 */

/** Factores del modelo comercial. Nombrados para que no aparezcan sueltos. */
export const FACTOR_ACOPLADO = 0.5;
export const FACTOR_INACTIVO = 0.3;

export enum Prepago {
  MENSUAL = 'mensual',
  ANUAL = 'anual',
  BIANUAL = 'bianual',
}

/** Descuento por prepago (§7.4). Se aplica sobre la suscripción, no sobre add-ons de terceros. */
export const DESCUENTO_PREPAGO: Record<Prepago, number> = {
  [Prepago.MENSUAL]: 0,
  [Prepago.ANUAL]: 0.15,
  [Prepago.BIANUAL]: 0.22,
};

/** Unidades facturables del período (máximos observados, ver §5.2 del plan). */
export interface UnidadesFacturables {
  activeTrucks: number;
  inactiveTrucks: number;
  activeTrailers: number;
  inactiveTrailers: number;
}

/** Lo mínimo que hace falta del plan para poder cotizar. */
export interface PlanFacturable {
  baseFee: number;
  pricePerVehicle: number;
}

/** Add-on contratado, ya resuelto a números. */
export interface AddonFacturable {
  code: string;
  name: string;
  /** Parte fija mensual. */
  monthlyPrice: number;
  /** Parte variable por vehículo (GPS, IA). */
  pricePerVehicle: number;
  /** Multiplicador para add-ons que se contratan por cantidad. */
  quantity?: number;
}

export interface LineaDetalle {
  concepto: string;
  detalle: string;
  importe: number;
}

export interface DesglosePrecio {
  baseAmount: number;
  vehiclesAmount: number;
  addonsAmount: number;
  discount: number;
  amount: number;
  /** Unidades equivalentes facturadas, para poder explicar la factura. */
  billedUnits: number;
  /** Camiones activos facturados. */
  billedTrucks: number;
  lineas: LineaDetalle[];
}

/** Redondeo a 2 decimales. Todo importe pasa por acá (riesgo R5.3). */
export const redondear = (n: number): number => Math.round(n * 100) / 100;

/**
 * Vehículos que se cuentan para la parte variable de la tarifa.
 *
 * Se devuelve por separado del precio porque también se usa para la parte
 * variable de los add-ons (GPS e IA se cobran por vehículo).
 */
export function calcularUnidadesEquivalentes(
  unidades: UnidadesFacturables,
): { billedTrucks: number; billedUnits: number } {
  const billedTrucks = unidades.activeTrucks;

  const billedUnits =
    billedTrucks +
    unidades.inactiveTrucks * FACTOR_INACTIVO +
    unidades.activeTrailers * FACTOR_ACOPLADO +
    unidades.inactiveTrailers * FACTOR_ACOPLADO * FACTOR_INACTIVO;

  return { billedTrucks, billedUnits: redondear(billedUnits) };
}

/**
 * Precio mensual completo: abono + vehículos + add-ons − descuento.
 *
 * `vehiculosParaAddons` es la cantidad de unidades sobre la que se cobran los
 * add-ons variables. Se usan los camiones facturados (no las unidades
 * equivalentes): un GPS se instala en un camión, no en medio acoplado.
 */
export function calcularPrecioMensual(
  plan: PlanFacturable,
  unidades: UnidadesFacturables,
  addons: AddonFacturable[] = [],
  prepago: Prepago = Prepago.MENSUAL,
): DesglosePrecio {
  const { billedTrucks, billedUnits } = calcularUnidadesEquivalentes(unidades);

  const baseAmount = redondear(plan.baseFee);
  const vehiclesAmount = redondear(billedUnits * plan.pricePerVehicle);

  const lineas: LineaDetalle[] = [
    {
      concepto: 'Abono del plan',
      detalle: 'Cargo fijo mensual',
      importe: baseAmount,
    },
    {
      concepto: 'Vehículos',
      detalle: describirUnidades(plan, unidades, billedTrucks, billedUnits),
      importe: vehiclesAmount,
    },
  ];

  let addonsAmount = 0;
  for (const addon of addons) {
    const cantidad = addon.quantity ?? 1;
    const fijo = addon.monthlyPrice * cantidad;
    const variable = addon.pricePerVehicle * billedTrucks;
    const importe = redondear(fijo + variable);
    if (!importe) continue;

    addonsAmount += importe;
    lineas.push({
      concepto: addon.name,
      detalle: addon.pricePerVehicle
        ? `$ ${addon.monthlyPrice} + ${billedTrucks} × $ ${addon.pricePerVehicle}`
        : 'Cargo fijo mensual',
      importe,
    });
  }
  addonsAmount = redondear(addonsAmount);

  const subtotal = redondear(baseAmount + vehiclesAmount + addonsAmount);
  const discount = redondear(subtotal * DESCUENTO_PREPAGO[prepago]);

  if (discount) {
    lineas.push({
      concepto: 'Descuento por prepago',
      detalle: `${Math.round(DESCUENTO_PREPAGO[prepago] * 100)} % (${prepago})`,
      importe: -discount,
    });
  }

  return {
    baseAmount,
    vehiclesAmount,
    addonsAmount,
    discount,
    amount: redondear(subtotal - discount),
    billedUnits,
    billedTrucks,
    lineas,
  };
}

/** Texto explicativo de cómo se llegó a las unidades facturadas. */
function describirUnidades(
  plan: PlanFacturable,
  unidades: UnidadesFacturables,
  billedTrucks: number,
  billedUnits: number,
): string {
  const partes: string[] = [`${billedTrucks} camiones`];

  if (unidades.inactiveTrucks) {
    partes.push(`${unidades.inactiveTrucks} camiones inactivos al 30 %`);
  }
  if (unidades.activeTrailers) {
    partes.push(`${unidades.activeTrailers} acoplados al 50 %`);
  }
  if (unidades.inactiveTrailers) {
    partes.push(`${unidades.inactiveTrailers} acoplados inactivos al 15 %`);
  }

  return `${partes.join(' + ')} = ${billedUnits} × $ ${plan.pricePerVehicle}`;
}

/**
 * Prorrateo de un cambio a mitad de período.
 *
 * Se cobra la DIFERENCIA de precio por los días que quedan hasta el cierre del
 * período vigente. Si el cambio abarata (un downgrade aplicado ya), da negativo
 * y no se emite nada: los downgrades se difieren a la renovación (§6.4), así que
 * esto no debería pasar, pero devolverlo permite detectarlo en vez de facturar
 * un crédito silencioso.
 */
export function calcularProrrateo(params: {
  precioAnterior: number;
  precioNuevo: number;
  fechaCambio: Date;
  periodEnd: Date;
  diasDelPeriodo: number;
}): { importe: number; diasRestantes: number } {
  const { precioAnterior, precioNuevo, fechaCambio, periodEnd } = params;

  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const diasRestantes = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - fechaCambio.getTime()) / MS_POR_DIA),
  );

  const diferencia = precioNuevo - precioAnterior;
  const importe = redondear(
    (diferencia * diasRestantes) / params.diasDelPeriodo,
  );

  return { importe, diasRestantes };
}
