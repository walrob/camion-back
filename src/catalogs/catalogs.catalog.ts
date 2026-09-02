/**
 * Catálogos de negocio configurables por empresa.
 *
 * Acá viven los **elementos de sistema**: los que trae el producto y el código
 * conoce por su clave. Una empresa puede renombrarlos, recolorearlos,
 * reordenarlos y desactivarlos, pero no eliminarlos ni cambiarles el
 * comportamiento (docs/CONFIGURACION.md §5).
 *
 * Los que agrega el cliente nacen sin comportamiento especial: en gastos, suman
 * como gasto, que es el default seguro.
 *
 * Para sumar un catálogo nuevo: agregar la definición acá, liberar la columna
 * correspondiente del `enum` de MySQL con una migración, y hacer que el front
 * lo lea del store en vez de su constante.
 */

export interface CatalogItemDef {
  key: string;
  label: string;
  color?: string;
  icon?: string;
  /** Sólo en los catálogos con comportamiento (hoy, gastos). */
  behavior?: string;
}

/**
 * Algunos catálogos no son sólo etiquetas: el código hace algo distinto según
 * el elemento. En gastos, un «adelanto» resta en la rendición; en puestos, el
 * puesto decide con qué rol entra la persona a la app.
 *
 * Eso no puede quedar librado a texto: cada catálogo declara acá el conjunto
 * **cerrado** de valores que el código entiende, y el elemento propio del
 * cliente elige uno. Sin esto, un cliente que crea «Adelanto por transferencia»
 * tendría un adelanto contado como gasto, y uno que crea el puesto «Playero»
 * no tendría con qué rol crearle el usuario.
 */
export interface CatalogBehaviorDef {
  /** Cómo se le presenta al usuario en la pantalla de configuración. */
  label: string;
  help: string;
  /** Valor que se aplica cuando el elemento propio no elige ninguno. */
  porDefecto: string;
  opciones: { value: string; label: string }[];
}

export interface CatalogDef {
  key: string;
  label: string;
  help: string;
  comportamiento?: CatalogBehaviorDef;
  items: CatalogItemDef[];
}

/** Comportamientos del catálogo de gastos. */
export const BEHAVIOR = {
  /** Suma en la rendición. Es el default de todo lo que no diga otra cosa. */
  EXPENSE: 'expense',
  /** Resta en la rendición: plata que la empresa ya le dio al chofer. */
  ADVANCE: 'advance',
} as const;

export const CATALOG = {
  EXPENSE_TYPE: 'expense_type',
  INCIDENT_TYPE: 'incident_type',
  DOCUMENT_CATEGORY: 'document_category',
  CERTIFICATION_TYPE: 'certification_type',
  EMPLOYEE_POSITION: 'employee_position',
  LEAVE_TYPE: 'leave_type',
  FUEL_TYPE: 'fuel_type',
} as const;

export const CATALOG_DEFS: CatalogDef[] = [
  {
    key: CATALOG.EXPENSE_TYPE,
    label: 'Tipos de gasto',
    help: 'Lo que el chofer puede cargar en la bitácora del viaje. Los marcados como adelanto restan en la rendición; el resto suma.',
    comportamiento: {
      label: 'Cómo cuenta en la rendición',
      help: 'Un adelanto es plata que la empresa ya le entregó al chofer: resta del neto a rendir.',
      porDefecto: BEHAVIOR.EXPENSE,
      opciones: [
        { value: BEHAVIOR.EXPENSE, label: 'Suma como gasto' },
        { value: BEHAVIOR.ADVANCE, label: 'Resta como adelanto' },
      ],
    },
    items: [
      { key: 'fuel', label: 'Combustible', color: 'primary', icon: 'mdi-gas-station' },
      { key: 'toll', label: 'Peaje', color: 'info', icon: 'mdi-boom-gate' },
      { key: 'expense', label: 'Gasto', color: 'secondary', icon: 'mdi-cash' },
      {
        key: 'cash_advance',
        label: 'Adelanto',
        color: 'warning',
        icon: 'mdi-cash-minus',
        behavior: BEHAVIOR.ADVANCE,
      },
      { key: 'repair', label: 'Reparación', color: 'error', icon: 'mdi-wrench' },
      { key: 'fine', label: 'Multa', color: 'error', icon: 'mdi-alert-octagon' },
      { key: 'per_diem', label: 'Viático', color: 'success', icon: 'mdi-food' },
      { key: 'other', label: 'Otro', color: 'grey', icon: 'mdi-dots-horizontal' },
    ],
  },
  {
    key: CATALOG.INCIDENT_TYPE,
    label: 'Tipos de incidente',
    help: 'Lo que el chofer puede reportar desde la app cuando algo pasa en la ruta.',
    items: [
      { key: 'mechanical', label: 'Rotura mecánica', color: 'warning', icon: 'mdi-wrench' },
      { key: 'accident', label: 'Accidente', color: 'error', icon: 'mdi-car-emergency' },
      { key: 'cash_shortage', label: 'Falta de dinero', color: 'info', icon: 'mdi-cash-remove' },
      { key: 'delay', label: 'Retraso', color: 'secondary', icon: 'mdi-clock-alert' },
      {
        key: 'cargo_issue',
        label: 'Problema con carga',
        color: 'warning',
        icon: 'mdi-package-variant-closed-remove',
      },
      {
        key: 'client_issue',
        label: 'Problema con cliente',
        color: 'info',
        icon: 'mdi-account-alert',
      },
      { key: 'emergency', label: 'Emergencia', color: 'error', icon: 'mdi-alarm-light' },
    ],
  },
  {
    key: CATALOG.DOCUMENT_CATEGORY,
    label: 'Categorías de documento',
    help: 'Los papeles que se guardan de cada camión, acoplado, chofer y de la empresa.',
    items: [
      { key: 'insurance', label: 'Seguro', color: 'primary' },
      { key: 'vtv', label: 'VTV', color: 'info' },
      { key: 'license', label: 'Licencia', color: 'secondary' },
      { key: 'id_card', label: 'Carnet / DNI', color: 'secondary' },
      { key: 'permit', label: 'Habilitación', color: 'warning' },
      { key: 'delivery_note', label: 'Remito', color: 'grey' },
      { key: 'waybill', label: 'Carta de porte', color: 'grey' },
      { key: 'other', label: 'Otro', color: 'grey' },
    ],
  },
  {
    key: CATALOG.CERTIFICATION_TYPE,
    label: 'Permisos y habilitaciones',
    help: 'Lo que vence en el legajo de cada persona. Varía por país y por tipo de carga.',
    items: [
      { key: 'driving_license', label: 'Carnet de conducir', color: 'primary' },
      { key: 'professional_license', label: 'Licencia profesional (LiNTI)', color: 'primary' },
      { key: 'dangerous_goods', label: 'Carga peligrosa', color: 'error' },
      { key: 'medical_exam', label: 'Psicofísico', color: 'info' },
      { key: 'hazmat', label: 'HazMat', color: 'error' },
      { key: 'crane_operator', label: 'Operador de grúa', color: 'secondary' },
      { key: 'defensive_driving', label: 'Manejo defensivo', color: 'info' },
      { key: 'first_aid', label: 'Primeros auxilios', color: 'info' },
      { key: 'other', label: 'Otro', color: 'grey' },
    ],
  },
  {
    key: CATALOG.EMPLOYEE_POSITION,
    label: 'Puestos',
    help: 'Los puestos del legajo. Cada uno define con qué rol entra la persona al sistema si se le crea acceso.',
    comportamiento: {
      label: 'Rol de acceso',
      help: 'Con qué permisos entra a la aplicación quien tenga este puesto. Se puede cambiar persona por persona al darle el acceso.',
      porDefecto: 'driver',
      opciones: [
        { value: 'admin', label: 'Administrador' },
        { value: 'manager', label: 'Gerente' },
        { value: 'dispatcher', label: 'Despachante' },
        { value: 'maintenance', label: 'Taller' },
        { value: 'driver', label: 'Chofer' },
        { value: 'hr', label: 'RRHH' },
        { value: 'auditor', label: 'Auditor' },
      ],
    },
    items: [
      { key: 'driver', label: 'Chofer', color: 'primary', behavior: 'driver' },
      { key: 'mechanic', label: 'Mecánico', color: 'info', behavior: 'maintenance' },
      { key: 'dispatcher', label: 'Despachante', color: 'secondary', behavior: 'dispatcher' },
      { key: 'manager', label: 'Gerente', color: 'warning', behavior: 'manager' },
      { key: 'admin', label: 'Administrativo', color: 'grey', behavior: 'admin' },
      { key: 'other', label: 'Otro', color: 'grey', behavior: 'driver' },
    ],
  },
  {
    key: CATALOG.LEAVE_TYPE,
    label: 'Motivos de licencia',
    help: 'Por qué se ausenta alguien. Depende del convenio de cada empresa.',
    items: [
      { key: 'vacation', label: 'Vacaciones', color: 'info' },
      { key: 'sick', label: 'Enfermedad', color: 'warning' },
      { key: 'work_accident', label: 'Accidente laboral', color: 'error' },
      { key: 'parental', label: 'Licencia parental', color: 'secondary' },
      { key: 'unpaid', label: 'Sin goce de sueldo', color: 'grey' },
      { key: 'study', label: 'Estudio', color: 'info' },
      { key: 'bereavement', label: 'Fallecimiento familiar', color: 'grey' },
      { key: 'other', label: 'Otra', color: 'grey' },
    ],
  },
  {
    key: CATALOG.FUEL_TYPE,
    label: 'Tipos de combustible',
    help: 'Lo que carga la flota. Una flota a GNC o eléctrica no usa la misma lista.',
    items: [
      { key: 'diesel', label: 'Diésel', color: 'primary', icon: 'mdi-gas-station' },
      { key: 'gasoline', label: 'Nafta', color: 'info', icon: 'mdi-fuel' },
      { key: 'gnc', label: 'GNC', color: 'success', icon: 'mdi-gas-cylinder' },
      { key: 'adblue', label: 'AdBlue', color: 'secondary', icon: 'mdi-water' },
    ],
  },
];

export const CATALOG_BY_KEY: Map<string, CatalogDef> = new Map(
  CATALOG_DEFS.map((c) => [c.key, c]),
);

/** ¿Esta clave es un elemento de sistema de ese catálogo? */
export const esDeSistema = (catalog: string, key: string): boolean =>
  !!CATALOG_BY_KEY.get(catalog)?.items.some((i) => i.key === key);
