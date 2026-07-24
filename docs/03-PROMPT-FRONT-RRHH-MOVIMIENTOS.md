# Prompt para el front — Historial laboral de RRHH y su impacto en Viajes

> Pegar en una sesión de Claude Code abierta sobre `front-camion`.

---

Trabajás sobre el front de FleetLog (Nuxt + Vuetify). El backend incorporó el
**historial laboral de empleados** y dos reglas de negocio que cruzan RRHH con
Viajes. Necesito que actualices el front para soportarlo, siguiendo las
convenciones que ya existen en el proyecto (stores, composables de API,
componentes de tabla y formulario, manejo de errores y notificaciones).

La API cuelga de `/api/v1`.

## 1. El cambio conceptual

Antes, un empleado tenía un campo `employmentStatus` (`active`, `on_leave`,
`suspended`, `terminated`) que se editaba a mano desde el formulario. Eso era un
dato puntual sin trazabilidad: no se sabía cuándo entró la persona, qué licencias
tuvo, ni por cuánto.

Ahora existe un **historial de movimientos** y `employmentStatus` pasó a ser un
valor **derivado y de solo lectura**: lo recalcula el backend a partir de los
movimientos, y se auto-corrige cuando una licencia vence (hay un cron diario).

**Lo primero que hay que hacer: sacar el selector de `employmentStatus` de los
formularios de alta y edición de empleado.** El backend ya no lo acepta (lo
descarta en silencio, así que si queda no da error pero tampoco hace nada, que es
peor). El estado se sigue mostrando como badge de solo lectura, y se sigue usando
como filtro en el listado.

## 2. Modelo de datos

### `EmploymentMovement`

```ts
type EmploymentMovementType =
  | 'hire'           // ingreso
  | 'leave'          // licencia
  | 'suspension'     // suspensión
  | 'reinstatement'  // reincorporación
  | 'termination';   // baja

type LeaveType =
  | 'vacation' | 'sick' | 'work_accident' | 'parental'
  | 'unpaid' | 'study' | 'bereavement' | 'other';

interface EmploymentMovement {
  id: string;
  employeeId: string;
  type: EmploymentMovementType;
  leaveType: LeaveType | null;   // solo cuando type === 'leave'
  startDate: string;             // 'YYYY-MM-DD'
  endDate: string | null;        // solo leave/suspension; null = período abierto
  resultingStatus: 'active' | 'on_leave' | 'suspended' | 'terminated';
  reason: string | null;         // motivo corto
  fileKey: string | null;        // adjunto respaldatorio
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}
```

Hay dos familias de movimiento y el formulario tiene que comportarse distinto
según cuál se elija:

- **Puntuales** (`hire`, `reinstatement`, `termination`): solo `startDate`. El
  campo de fecha de fin no se muestra — si se manda, el backend rechaza.
- **Con período** (`leave`, `suspension`): `startDate` y `endDate` opcional.
  Dejar `endDate` vacío significa "sin fecha de fin definida" y es válido.

El campo `leaveType` **solo** se muestra cuando el tipo es `leave`. Si se manda
en cualquier otro tipo, el backend rechaza. Si el tipo es `leave` y no se manda,
el backend lo guarda como `other`.

## 3. Endpoints nuevos

| Método | Ruta | Roles |
|---|---|---|
| `POST` | `/api/v1/hr/movements` | admin, hr |
| `GET` | `/api/v1/hr/movements/active` | admin, hr, manager, dispatcher |
| `GET` | `/api/v1/hr/movements/:id` | admin, hr, manager, dispatcher |
| `PATCH` | `/api/v1/hr/movements/:id` | admin, hr |
| `PATCH` | `/api/v1/hr/movements/:id/close` | admin, hr |
| `DELETE` | `/api/v1/hr/movements/:id` | admin, hr |
| `GET` | `/api/v1/hr/employees/:id/movements` | admin, hr, manager |

**`POST /hr/movements`** — body:

```json
{
  "employeeId": "uuid",
  "type": "leave",
  "leaveType": "sick",
  "startDate": "2026-08-10",
  "endDate": "2026-08-20",
  "reason": "Reposo indicado por el médico laboral",
  "notes": null,
  "fileKey": null
}
```

**`PATCH /hr/movements/:id`** — mismo body sin `employeeId` (un movimiento no se
puede mover de legajo), todo opcional. Mandar `endDate: null` explícito reabre un
período cerrado.

**`PATCH /hr/movements/:id/close`** — sin body. Cierra hoy un período abierto
(reincorporación anticipada). Solo vale para `leave` y `suspension`. Útil como
botón directo en la fila del historial cuando el movimiento está abierto.

**`GET /hr/movements/active`** — licencias y suspensiones vigentes hoy, con el
empleado embebido (`relations: ['employee']`). Pensado para un tablero de RRHH:
"quién está fuera de servicio hoy".

**`GET /hr/employees/:id/movements`** — historial completo del legajo, ordenado
del más reciente al más viejo.

Además, `GET /hr/employees/:id` ahora devuelve `movements[]` junto a
`certifications[]` y `assignments[]`, así que el detalle puede pintar el
historial sin una segunda request.

## 4. Cambios en los endpoints de empleados

- `POST /hr/employees`: ya **no** acepta `employmentStatus` ni `terminationDate`.
  Sigue aceptando `hireDate`, y ahora esa fecha **genera automáticamente el
  movimiento de ingreso** que abre el historial. Conviene que el campo pase a ser
  obligatorio en el form (o al menos muy recomendado), porque un legajo sin
  `hireDate` nace sin historial.
- `PATCH /hr/employees/:id`: ya **no** acepta `employmentStatus`,
  `terminationDate` ni `hireDate`. Para corregir la fecha de ingreso hay que
  editar el movimiento `hire` desde el historial.
- El filtro `?employmentStatus=` del listado sigue funcionando igual.

## 5. Regla A — asignar un viaje a un chofer no disponible

`POST /api/v1/trips` y `PATCH /api/v1/trips/:id` ahora validan la situación del
legajo del chofer **en la fecha de inicio prevista del viaje** (`plannedStartAt`),
no en la fecha de hoy.

| Situación en la fecha del viaje | Resultado |
|---|---|
| Activo | Asigna normal |
| Activo en esa fecha, pero de licencia hoy | Asigna, y el back genera una alerta |
| De licencia | **400** |
| Suspendido | **400**, sin excepción |
| Dado de baja | **400**, sin excepción |

Para el caso de licencia hay una salida: el body acepta **`closeLeave: boolean`**.
Con `closeLeave: true`, el backend finaliza la licencia el día anterior al inicio
del viaje, deja registro en el legajo, genera una alerta naranja para RRHH y
asigna el viaje.

**El flujo de UI que hay que armar:**

1. El usuario intenta asignar el viaje normalmente (sin `closeLeave`).
2. Si vuelve un 400 cuyo mensaje indica licencia, mostrar un diálogo de
   confirmación con el texto del error del backend, que ya viene armado para el
   usuario final:
   > *"Fernando Aguirre está de licencia hasta el 2026-08-20. Reprogramá el viaje
   > para después de esa fecha o confirmá la finalización de la licencia."*
3. Si el usuario confirma, reintentar el mismo request con `closeLeave: true`.
4. Si cancela, no hacer nada (puede editar la fecha y reintentar).

Los otros 400 (suspensión, baja) **no** se reintentan: son bloqueos duros y solo
hay que mostrar el mensaje. Para distinguirlos, alcanza con el texto del mensaje,
pero conviene que el diálogo de confirmación solo aparezca cuando el mensaje
contenga "de licencia" — o, mejor, coordiná conmigo si preferís que el backend
devuelva un código de error estructurado en vez de texto (hoy no lo hace).

Mensajes exactos que devuelve el backend:

- `«Nombre» está de licencia hasta el YYYY-MM-DD. Reprogramá el viaje para después de esa fecha o confirmá la finalización de la licencia.` (o `sin fecha de fin definida`)
- `«Nombre» está suspendido hasta el YYYY-MM-DD. La suspensión debe levantarse desde RRHH antes de asignarle un viaje.`
- `«Nombre» está dado de baja desde el YYYY-MM-DD. No se le pueden asignar viajes.`
- `La licencia de «Nombre» empieza el YYYY-MM-DD, el mismo día del viaje o después. Si se cargó por error, eliminala desde RRHH.`

## 6. Regla B — cargar una licencia a un chofer con viajes abiertos

La dirección inversa. Al crear o editar un movimiento de tipo `leave`,
`suspension` o `termination`, el backend verifica que el chofer no tenga viajes
en estado `assigned` o `in_progress` que se pisen con el período. Si los tiene,
devuelve **400 y no hay flag de escape**: primero hay que cancelar o finalizar el
viaje.

```
El chofer tiene 1 viaje(s) sin cerrar en ese período:
V-00012 (Buenos Aires → Córdoba, 2026-08-12, asignado).
Cancelá o finalizá el/los viaje(s) antes de cargar el movimiento.
```

En la UI: mostrar el error tal cual, y —si es fácil con la arquitectura actual—
ofrecer un acceso directo al listado de viajes filtrado por ese chofer, porque es
lo que el usuario va a necesitar hacer a continuación. El mensaje incluye hasta 3
códigos de viaje y luego `y N más`.

## 7. Otros errores de validación de movimientos

Todos vuelven como 400 con mensaje listo para mostrar:

- `La fecha de fin no puede ser anterior a la de inicio.`
- `Solo las licencias y suspensiones admiten fecha de fin.`
- `El motivo de licencia solo aplica a movimientos de tipo licencia.`
- `El período se superpone con otro movimiento del legajo (2026-08-01 a 2026-08-20).`
  — licencias y suspensiones son excluyentes, no puede haber dos pisándose.

## 8. Alertas

Se agregó el valor `employment` a `AlertSourceType`. Si el front tipa ese enum o
mapea íconos/colores por tipo de alerta, hay que contemplarlo. Las alertas nuevas
son:

- **Naranja** — "Licencia finalizada para asignar un viaje" (se usó `closeLeave`).
- **Amarilla** — "Viaje asignado a un chofer de licencia" (el viaje arranca
  después de que termina la licencia, es informativa).

Ambas van a los roles `admin`, `hr`, `manager` y `dispatcher`, y llegan por el
websocket de alertas que ya existe.

## 9. Trabajo concreto a hacer

1. **Tipos**: agregar `EmploymentMovement`, `EmploymentMovementType`, `LeaveType`;
   agregar `employment` a `AlertSourceType`; sacar `employmentStatus`,
   `terminationDate` y `hireDate` de los tipos de payload de update de empleado.
2. **Store / composable de RRHH**: métodos para listar el historial de un
   empleado, crear, editar, cerrar y borrar movimientos, y traer los vigentes.
3. **Detalle del empleado**: pestaña o sección "Historial laboral" con una línea
   de tiempo o tabla ordenada por fecha descendente. Cada fila: tipo (con chip de
   color), motivo de licencia si aplica, período (`desde` – `hasta` o "en curso"),
   razón, y acciones (editar, cerrar si está abierto, eliminar) según rol.
4. **Formulario de movimiento**: campos condicionales según el tipo, como se
   describe en la sección 2.
5. **Formularios de empleado**: quitar el selector de estado laboral; dejar el
   estado como badge de solo lectura, con un tooltip que aclare que se controla
   desde el historial.
6. **Asignación de viaje**: el flujo de confirmación de la sección 5.
7. **Tablero de RRHH** (si existe, o como widget): "Fuera de servicio hoy" usando
   `GET /hr/movements/active`.

Antes de empezar, revisá cómo están resueltos hoy el detalle de empleado, el
formulario de alta de viaje y el manejo de errores 400, y seguí esos patrones en
vez de introducir otros nuevos. Si algo del backend te falta para armar una
pantalla, decímelo antes de inventar un endpoint.
