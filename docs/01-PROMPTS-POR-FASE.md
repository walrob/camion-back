# Prompts de Ejecución por Fase

> Compañero de [`00-PLAN-MAESTRO.md`](./00-PLAN-MAESTRO.md). Cada prompt es
> **autocontenido**: se puede pegar en una sesión nueva de Claude Code aunque las
> sesiones anteriores se hayan perdido. Ejecutá **un prompt por vez**; cada uno
> declara qué entrega y qué archivos toca.

## Cómo usar este documento

1. Empezá por la **Fase 0** y avanzá en orden (las dependencias están en el plan).
2. Copiá el bloque del prompt y pegalo como mensaje a Claude Code en este repo.
3. Al terminar cada prompt, verificá compilación (`npm run build` en back, `npm run
   build` en front) y commiteá con el mensaje sugerido.
4. Si una sesión se corta, abrí una nueva y pegá el siguiente prompt: el contexto
   necesario está dentro del propio prompt.

> **Preámbulo recomendado** (pegar al inicio de cada prompt si la sesión es nueva):
> *"Backend en `back-camion` (NestJS 11 + TypeORM/MySQL, JWT con Role enum +
> guards, S3 StorageService, WebSockets, @nestjs/schedule, pdfkit, xlsx, sharp).
> Front en `../front-camion` (Nuxt 3 + Vuetify 3 + Pinia + composables useApi +
> Capacitor). Seguí el patrón de `src/clients` (módulo+controller+service+dto+
> entities, entidades con uuid y auditoría createdAt/By, updatedAt/By, deletedAt/By
> soft delete). Es una sola empresa (no multi-tenant). Aplicá buenas prácticas:
> componentes/funciones pequeños y de responsabilidad única, DRY (reutilizar antes
> de crear), controllers delgados con la lógica en services, DTOs validados, tipado
> estricto. Estamos construyendo un sistema de gestión de flota de camiones."*

## Convenciones de Frontend (OBLIGATORIAS en todo prompt de front)

El front está en `../front-camion` (hermano de `back-camion`). **Reutilizá lo
existente, no reinventes.** Todo prompt de front debe respetar:

- **Tablas/listas → siempre `<ResponsiveTable>`** (`components/ResponsiveTable.vue`):
  props `headers:{title,value,minWidth?}[]`, `items`, `loading`, `noDataText`,
  `allItems`; slots `item.<col>`, `item.actions`, `mobile-item`, `bottom`. En móvil
  renderiza tarjetas solo (clave para la app del chofer). **No** usar `<v-data-table>`
  pelado.
- **Texto del chofer → siempre con dictado por voz**: `<VoiceTextField>`
  (`components/form/VoiceTextField.vue`, campos cortos) y `<VoiceTextarea>`
  (`components/form/VoiceTextarea.vue`, textos largos) en lugar de `v-text-field`/
  `v-textarea`. v-model + reenvían `label`, `rules`, `density`, etc. Idioma `es-AR`.
  Usarlos en: observaciones de gasto, notas de checklist, descripción de incidente,
  notas de viaje y de OT, y búsquedas.
- **Datos → `useApi()`** (`composables/useApi.ts`) + **store Pinia por dominio**
  (estado+`loading`+`pagination`+acciones, ver `stores/client.ts`) + **composable
  `useXxx`**. Snackbars vía `useGeneralStore`. Params de listado `{limit,page,search,
  ...filtros}`.
- **Geolocalización → composable `useGeolocation()`** (crear en Fase 0 reutilizando
  el patrón de `components/form/AddressWithGeo.vue`: `navigator.geolocation` +
  `@capacitor/geolocation`). Usar al iniciar/finalizar viaje, cargar gasto y reportar
  incidente.
- **Fotos/comprobantes → input `capture="environment"`** + compresión (reusar
  `modal/ImageCropper`, `modal/File`, `list/Files`) → subir al módulo `attachments`.
- **Confirmaciones → `<modal/Confirm>`. Fechas → `<form/InputFecha>`.**
- **Layouts**: `driver` (chofer, bottom-nav) y `admin` (sidebar `sidebarItem.ts`).
  Declarar con `definePageMeta({ layout })`. Validaciones con `useValidations()`.
  Tipos en `~/types/project` y `~/types/enums`.
- **Componentes pequeños**: cada pantalla compone piezas chicas (tabla, diálogo de
  alta/edición, filtros, fila) extraídas a sus propios componentes; nada de `.vue`
  gigantes. Lógica de datos en stores/composables, no en la vista. Ver §11 del plan.

---

## FASE 0 — Fundaciones

### Prompt 0.1 — Limpiar el dominio e-commerce
```
Vamos a reconvertir este backend (era un e-commerce/producción textil) en un
sistema de gestión de flota de camiones. ELIMINÁ los módulos de dominio que ya no
aplican y desregistralos de app.module.ts: categories, products, price-lists,
quotes, production-orders, production-stages, fabrics, clients (lo reintroduciremos
como "clientes de carga" más adelante si hace falta). MANTENÉ y respetá: auth,
users, common (storage, decorators, enums, interfaces, utils), notifications,
dashboard (lo vaciaremos para reusarlo). Hacé lo mismo en el front-camion:
quitá pages/stores/composables de cart, checkout, productos, quotes,
production-orders, price-lists, fabrics, categories. Asegurate de que back y front
sigan compilando (npm run build) tras la limpieza. No toques la lógica de auth ni
de storage. Al final, listá qué quedó.
```
**Entrega:** repo limpio, sólo base reutilizable. **Commit:** `chore: limpiar dominio ecommerce, dejar base para flota`.

### Prompt 0.2 — Roles del dominio flota
```
Refactorizá src/common/enums/role.enum.ts a los roles del sistema de flota:
ADMIN='admin', MANAGER='manager', DISPATCHER='dispatcher', MAINTENANCE='maintenance',
DRIVER='driver', HR='hr', AUDITOR='auditor'. Actualizá cualquier referencia a los roles
viejos (seller/production/operator) en guards, decorators (@Auth/@Roles) y en el
seed/creación de usuarios. En el front, actualizá el manejo de roles, los layouts
(crear placeholders 'driver' y 'admin') y el middleware de auth para redirigir
según rol (driver -> app chofer, resto -> backoffice). Mantené todo compilando.
```
**Entrega:** roles nuevos en back+front. **Commit:** `feat: roles del dominio flota`.

### Prompt 0.3 — Módulo común de Attachments (S3 polimórfico)
```
Creá un submódulo común src/common/attachments reutilizando StorageService.
Entidad Attachment (uuid + auditoría): entityType (string), entityId (uuid),
kind ('image'|'audio'|'video'|'pdf'), s3Key, mime, sizeBytes, uploadedBy.
Service con: upload(file, entityType, entityId, kind) que comprime imágenes con
sharp antes de subir a S3 y crea el registro; getPresignedUrl(attachmentId);
listByEntity(entityType, entityId); remove(id) (soft delete). Controller con
endpoints protegidos por @Auth. Exportá el service para que otros módulos lo
inyecten. Documentá en Swagger. Hacelo genérico para usarlo en bitácora,
incidentes, checklist, mantenimiento y documentos.
```
**Entrega:** adjuntos reutilizables. **Commit:** `feat: módulo común de attachments S3`.

### Prompt 0.4 — Base del frontend (layouts, geolocalización, tipos)
```
En ../front-camion preparemos la base para el dominio flota SIN romper lo existente.
1) Layouts: dejá listo layouts/admin.vue (sidebar vertical existente) y creá
   layouts/driver.vue como shell de la app del chofer con una barra de navegación
   inferior (bottom nav) de íconos grandes (placeholders: Inicio, Viaje, Incidentes,
   Documentos, Mensajes).
2) Middleware: en middleware/auth.global.ts redirigí por rol (DRIVER -> /chofer,
   resto -> /admin). Roles en ~/types/enums alineados al back (admin, manager,
   dispatcher, maintenance, driver, auditor).
3) Composable useGeolocation(): reutilizá el patrón de navigator.geolocation de
   components/form/AddressWithGeo.vue (timeout, no bloquear si se deniega), con
   fallback a @capacitor/geolocation. Devuelve { lat, lng, accuracy, getPosition() }.
4) Tipos base en ~/types/project para el dominio (Truck, Driver, Trip, etc. mínimos).
Confirmá que useApi, ResponsiveTable, VoiceTextField y VoiceTextarea siguen
disponibles para reutilizar. No dupliques componentes. Mantené el build (npm run build).
```
**Entrega:** base front lista para construir pantallas. **Commit:** `feat(front): base de layouts, geolocalización y tipos de flota`.

---

## FASE 1 — Flota & Choferes

### Prompt 1.1 — Módulo fleet (camiones, acoplados, flotas)
```
Creá el módulo src/fleet siguiendo el patrón de src/clients. Entidades (uuid +
auditoría + soft delete):
- Fleet: name, code(unique), notes, isActive.
- Truck: plate(unique), internalNumber, brand, model, year, type, loadCapacityKg,
  currentOdometerKm(default 0), engineHours(default 0), status
  ('available'|'on_trip'|'stopped'|'workshop'|'out_of_service', default available),
  fleetId (ManyToOne Fleet, nullable).
- Trailer: plate(unique), type, loadCapacityKg, status('available'|'in_use'|
  'workshop'|'out_of_service'), isActive.
CRUD completo (controller+service+dtos con class-validator) con paginación
(nestjs-typeorm-paginate) y filtros (por flota, estado, búsqueda por patente).
Endpoint para actualizar odómetro/horas. Guards: ABM sólo ADMIN/MANAGER, lectura
DISPATCHER/MAINTENANCE. Swagger. Registrá el módulo en app.module.ts.
```
**Commit:** `feat: módulo fleet (camiones, acoplados, flotas)`.

### Prompt 1.2 — Módulo drivers (perfil de chofer)
```
Creá el módulo src/drivers. Entidad Driver (uuid + auditoría): userId (relación 1:1
con User), licenseNumber, licenseType, licenseExpiry (date), phone, status
('active'|'on_trip'|'inactive'), notes. Al crear un Driver se crea/asocia un User
con rol DRIVER (reutilizá UsersModule). CRUD con paginación y filtros (estado,
búsqueda por nombre/licencia). Endpoint GET /drivers/me que devuelve el perfil del
chofer autenticado. Guards: ABM ADMIN/DISPATCHER, el propio chofer puede ver /me.
Swagger. Registrá en app.module.ts.
```
**Commit:** `feat: módulo drivers (perfil de chofer)`.

### Prompt 1.3 — Front: ABM de flota y choferes
```
En ../front-camion, creá las pantallas de backoffice (layout admin) para gestionar
flota y choferes, siguiendo el patrón de stores/composables existentes (Pinia +
useApi + useXxx, ver stores/client.ts). Páginas: /admin/flota (camiones con filtros
por flota y estado, alta/edición en diálogo Vuetify, gestión de acoplados y flotas en
tabs) y /admin/choferes (alta que crea usuario+driver, edición, vencimiento de
licencia resaltado). OBLIGATORIO: las tablas usan <ResponsiveTable> (con slots
item.actions y mobile-item); los campos de notas/observaciones usan <VoiceTextField>/
<VoiceTextarea>; confirmaciones con <modal/Confirm>; fechas con <form/InputFecha>.
Stores: fleet.ts, driver.ts. Composables: useFleet.ts, useDrivers.ts. Responsive.
```
**Commit:** `feat(front): ABM de flota y choferes`.

---

## FASE 1B — RRHH (Personal, permisos y asignaciones)

> Módulo de Recursos Humanos: legajo del personal, permisos/habilitaciones con
> vencimiento (carnet, carga peligrosa, psicofísico, LiNTI…) y asignación
> chofer↔camión. Reconcilia con `drivers` (Fase 1): los datos personales y los
> carnets se mueven a RRHH; `Driver` queda como perfil operativo.

### Prompt 1B.1 — Backend del módulo hr
```
Creá el módulo src/hr siguiendo el patrón del proyecto. Entidades (uuid + auditoría
+ soft delete):
- Employee (legajo): userId(nullable, 1:1 User si tiene acceso al sistema),
  firstName, lastName, documentId (DNI/CUIL, unique), birthDate, position
  ('driver'|'mechanic'|'dispatcher'|'admin'|'other'), hireDate, terminationDate
  (nullable), employmentStatus('active'|'on_leave'|'suspended'|'terminated'), phone,
  address, emergencyContactName, emergencyContactPhone, photoKey(nullable, vía
  attachments), notes.
- Certification (permiso/habilitación con vencimiento): employeeId, type
  ('driving_license'|'professional_license'|'dangerous_goods'|'medical_exam'|'hazmat'
  |'crane_operator'|'defensive_driving'|'first_aid'|'other'), class(nullable, ej.
  clase del carnet), number, issuedBy, issueDate, expiryDate, fileKey(vía attachments),
  status('valid'|'expiring'|'expired', CALCULADO a partir de expiryDate y un umbral),
  notes.
- TruckAssignment (asignación chofer↔camión, con historial): employeeId, truckId,
  assignedAt, unassignedAt(nullable), isPrimary(bool), notes. Sólo una asignación
  primary activa por chofer y por camión a la vez (validar al asignar y cerrar la
  anterior).
Reconciliación con drivers (Fase 1): agregá Driver.employeeId (1:1 con Employee) y
migrá los campos de licencia del Driver a una Certification type='driving_license'
(dejá el Driver con status y los vínculos; los carnets viven en Certification).
Endpoints: CRUD de Employee con filtros (estado, position, búsqueda nombre/DNI) y
paginación; CRUD de Certification por empleado + subida de archivo; asignar/
desasignar camión y GET historial y asignación vigente por chofer/por camión;
GET /hr/certifications/expiring?days=30 (permisos por vencer). Cron diario que
recalcula Certification.status y, si vence dentro del umbral, genera una alerta (vía
módulo alerts cuando exista; mientras tanto, dejá el hook listo). Guards: ABM HR/ADMIN;
MANAGER/DISPATCHER lectura; el chofer ve sus propios permisos. Swagger. Registrá en
app.module.ts. Añadí el rol HR si aún no está en el Role enum.
```
**Entrega:** RRHH backend. **Commit:** `feat: módulo hr (legajos, permisos y asignaciones)`.

### Prompt 1B.2 — Front: RRHH (legajos, permisos, asignaciones)
```
En ../front-camion (layout admin) creá /admin/rrhh para Recursos Humanos, componiendo
componentes pequeños (no un .vue gigante): 
- Listado de personal en <ResponsiveTable> con filtros (estado, puesto, búsqueda) y
  alta/edición en diálogo (componente propio EmployeeFormDialog). Notas/observaciones
  con <VoiceTextarea>; fechas con <form/InputFecha>; foto del legajo vía attachments.
- Detalle de empleado con pestañas: Datos, Permisos/Habilitaciones (tabla de
  certificaciones con estado vigente/por vencer/vencido en colores, alta con archivo y
  fechas), y Asignación de camión (camión vigente + historial, acción asignar/
  desasignar).
- Tablero de vencimientos de permisos (por vencer/vencidos) reutilizable.
Store hr.ts (o employee.ts + certification.ts) siguiendo el patrón de stores/client.ts;
composables useHr.ts / useCertifications.ts. Agregá el ítem RRHH en sidebarItem.ts
visible para roles HR/ADMIN/MANAGER. Confirmaciones con <modal/Confirm>.
```
**Entrega:** RRHH front. **Commit:** `feat(front): RRHH (personal, permisos y asignaciones)`.

---

## FASE 2 — Viajes + Bitácora Digital (Módulo #1)

### Prompt 2.1 — Backend de viajes
```
Creá el módulo src/trips. Entidad Trip (uuid + auditoría): code(autogenerado),
truckId, trailerId(nullable), driverId, clientId(nullable, string libre por ahora),
origin, destination, cargoDescription, plannedStartAt, plannedEndAt, startedAt,
finishedAt, startOdometerKm, endOdometerKm, distanceKm(calculado al finalizar),
status('assigned'|'in_progress'|'finished'|'canceled', default assigned), notes.
Endpoints: CRUD; POST /trips/:id/start (setea startedAt, startOdometerKm, pone
truck.status='on_trip' y driver.status='on_trip'); POST /trips/:id/finish (setea
finishedAt, endOdometerKm, calcula distanceKm, actualiza truck.currentOdometerKm y
libera truck/driver a 'available'); GET /trips/me (viajes del chofer autenticado).
Filtros por estado/camión/chofer/flota/fechas, paginación. Guards: asignación
DISPATCHER/ADMIN; start/finish el DRIVER dueño; lectura MANAGER/AUDITOR. Swagger.
```
**Commit:** `feat: módulo trips (viajes)`.

### Prompt 2.2 — Backend de bitácora / gastos
```
Creá el módulo src/trip-log. Entidad TripLogEntry (uuid + auditoría): tripId,
type('fuel'|'toll'|'expense'|'cash_advance'|'repair'|'fine'|'per_diem'|'other'),
amount(decimal), currency(default 'ARS'), liters(nullable, para fuel),
odometerKm(nullable), lat/lng(nullable), occurredAt, notes. Los comprobantes
(fotos) se asocian con el módulo common/attachments (entityType='trip_log_entry').
Endpoints: POST (el DRIVER del viaje carga una entrada, con soporte de subir
comprobante), GET por viaje, GET /trip-log/me (entradas del chofer), edición/borrado
(soft) sólo del autor mientras el viaje no esté liquidado. Endpoint de resumen por
viaje: totales por tipo, total general, total adelantos. Aceptá un clientId/uuid
idempotente opcional en el POST para soportar sync offline futura. Guards y Swagger.
```
**Commit:** `feat: módulo trip-log (bitácora y gastos)`.

### Prompt 2.3 — Front: app del chofer (viajes + bitácora)
```
En ../front-camion, creá la base de la "App del Chofer" en el layout driver. Páginas:
/chofer (home con sus viajes asignados/en curso, botones grandes Iniciar/Finalizar
viaje que capturan GPS con useGeolocation), /chofer/viaje/[id] (detalle con bitácora:
lista de gastos por tipo en <ResponsiveTable> con slot mobile-item en tarjetas, FAB
para agregar gasto con formulario que captura tipo, monto, litros si es combustible,
odómetro, observaciones y FOTO del comprobante con la cámara). OBLIGATORIO: el campo
de observaciones usa <VoiceTextField> (dictado por voz, es-AR); la foto vía input
capture="environment" subida al módulo attachments; al guardar el gasto se adjunta
lat/lng de useGeolocation. Mostrá totales del viaje en vivo. Stores: trip.ts,
tripLog.ts. Composables: useTrips.ts, useTripLog.ts. UX de una mano, botones grandes,
pensada para la ruta y poca señal.
```
**Commit:** `feat(front): app del chofer con bitácora`.

### Prompt 2.4 — Liquidación / rendición
```
Creá el módulo src/settlements. Entidad Settlement (uuid + auditoría): tripId (o
driverId+período), totales por tipo de gasto, totalAdvances, netToSettle, status
('draft'|'closed'), pdfKey. Service que arma la liquidación agregando los
TripLogEntry del viaje (neto = gastos rendidos - adelantos). Genera un PDF con
pdfkit (detalle de gastos con miniaturas de comprobantes opcional) y lo guarda en
S3. Endpoints: generar/recalcular, cerrar (bloquea edición de la bitácora del
viaje), descargar PDF, listar con filtros por chofer/período/estado. Guards:
ADMIN/AUDITOR/MANAGER. Swagger. En el front (layout admin) agregá /admin/
liquidaciones con listado, generación y descarga de PDF.
```
**Commit:** `feat: módulo settlements (liquidaciones)`.

---

## FASE 3 — Checklist pre-viaje (Módulo #5)

### Prompt 3.1 — Backend de checklists
```
Creá el módulo src/checklists. Entidad Checklist (uuid + auditoría): tripId,
truckId, driverId, result('pending'|'approved'|'rejected'), signatureKey(nullable),
signedAt(nullable). Entidad ChecklistItem: checklistId, key
('lights'|'brakes'|'tires'|'oil'|'fire_extinguisher'|'documentation'|'trailer'|
'other'), label, status('ok'|'fail'|'na'), notes; las fotos por ítem se asocian con
common/attachments (entityType='checklist_item'). Endpoints: crear checklist para un
viaje con la plantilla de ítems por defecto, cargar/actualizar ítems con foto,
firmar (sube imagen de firma a S3 y marca result), GET por viaje. Regla: un viaje no
puede iniciarse (trips start) si su checklist no está 'approved' (validá en trips o
expón un flag). Guards: DRIVER dueño; lectura DISPATCHER/MAINTENANCE. Swagger.
```
**Commit:** `feat: módulo checklists (inspección pre-viaje)`.

### Prompt 3.2 — Front: checklist del chofer con fotos y firma
```
En ../front-camion, agregá al flujo de inicio de viaje del chofer la pantalla
/chofer/viaje/[id]/checklist: lista de ítems (luces, frenos, cubiertas, aceite,
matafuego, documentación, acoplado) con toggle OK/Falla/NA, foto opcional por ítem
(input capture="environment" -> attachments) y observaciones por ítem con
<VoiceTextField> (dictado por voz), más un canvas de firma digital al final. Al
aprobar, habilita el botón "Iniciar viaje". Store checklist.ts + composable
useChecklists.ts. Componente de firma (canvas táctil) compatible con móvil.
```
**Commit:** `feat(front): checklist pre-viaje con firma`.

---

## FASE 4 — Centro de Incidentes (Módulo #2)

### Prompt 4.1 — Backend de incidentes
```
Creá el módulo src/incidents. Entidad Incident (uuid + auditoría): code, tripId
(nullable), truckId, driverId, type('mechanical'|'accident'|'cash_shortage'|'delay'
|'cargo_issue'|'client_issue'|'emergency'), severity('low'|'medium'|'high'|
'critical'), status('pending'|'in_progress'|'resolved', default pending),
assignedToUserId(nullable), lat/lng(nullable), description, resolvedAt(nullable).
Entidad IncidentEvent (timeline): incidentId, userId, action, note, at. Adjuntos
(foto/audio/video) vía common/attachments (entityType='incident'). Endpoints: crear
(el DRIVER selecciona tipo y adjunta evidencia + GPS), asignar responsable, cambiar
estado (registra evento en timeline), comentar, listar con filtros (estado, tipo,
severidad, camión, chofer, sin asignar) y GET /incidents/me. Al crear un incidente,
emití un evento interno (EventEmitter o llamada a alerts) para el motor de alertas.
Guards: crear DRIVER; gestionar DISPATCHER/ADMIN. WebSocket gateway para empujar
incidentes nuevos al panel. Swagger.
```
**Commit:** `feat: módulo incidents (centro de incidentes)`.

### Prompt 4.2 — Front: reportar y gestionar incidentes
```
En ../front-camion: (chofer) /chofer/incidente/nuevo con selector de tipo en botones
grandes con íconos, descripción con <VoiceTextarea> (dictado por voz, clave porque el
chofer no puede teclear en ruta), captura de foto/audio/video (-> attachments) y
ubicación GPS con useGeolocation; /chofer/incidentes lista los suyos con estado.
(Backoffice, layout admin) /admin/incidentes: tablero con filtros y columnas por
estado (pendiente/en proceso/resuelto); las listas usan <ResponsiveTable>; asignación
de responsable, timeline de eventos, visor de adjuntos, refresco en vivo por WebSocket.
Stores incident.ts; composable useIncidents.ts.
```
**Commit:** `feat(front): reportar y gestionar incidentes`.

---

## FASE 5 — Alertas Inteligentes (Módulo #3)

### Prompt 5.1 — Motor de alertas (backend)
```
Creá el módulo src/alerts. Entidad Alert (uuid + auditoría): level('red'|'orange'|
'yellow'|'green'), type, sourceType('incident'|'expense'|'document'|'truck_idle'|
'maintenance'), sourceId, title, message, status('new'|'seen'|'acknowledged'|
'resolved', default new), targetRoles (simple-array). Entidad AlertRuleConfig
(umbrales configurables): key, value, enabled (ej: idleHoursThreshold=6,
expenseAmountThreshold, expiryWarningDays=30). AlertsService con createAlert() y
listeners: incidente creado -> alerta roja/naranja según severidad; gasto que supera
umbral -> amarilla. Cron (@nestjs/schedule): cada X min detecta "camión detenido"
(sin avance de odómetro / sin geoping > idleHoursThreshold y status on_trip) ->
naranja; chequeo diario de documentos por vencer -> verde. Emití por WebSocket a los
targetRoles y dispará notificación (email/push) para red/orange. Endpoints: listar
con filtros (nivel, estado), marcar vista/atendida/resuelta, ABM de umbrales.
Guards: DISPATCHER/MANAGER/ADMIN. Swagger.
```
**Commit:** `feat: módulo alerts (motor de alertas inteligentes)`.

### Prompt 5.2 — Front: panel de alertas en vivo
```
En front-camion (layout admin) creá /admin/alertas: bandeja priorizada por nivel
(rojo arriba), con badge de no leídas en la barra superior, filtros por nivel/estado,
acciones marcar visto/atender/resolver, y suscripción WebSocket para que entren en
vivo (con sonido/vibración para rojas). Store alert.ts + composable useAlerts.ts.
Mostrá un indicador global de alertas activas reutilizable en el dashboard.
```
**Commit:** `feat(front): panel de alertas en vivo`.

---

## FASE 6 — Mantenimiento Preventivo (Módulo #6)

### Prompt 6.1 — Backend de mantenimiento
```
Creá el módulo src/maintenance. Entidades (uuid + auditoría):
- MaintenancePlan: truckId, name, triggerType('km'|'hours'|'date'), intervalValue,
  lastServiceKm, lastServiceAt, nextDueKm, nextDueAt, status('active'|'paused').
- MaintenanceOrder (orden de trabajo): truckId, planId(nullable), date, odometerKm,
  description, items(simple-json: lista de tareas/repuestos), cost, status
  ('open'|'in_progress'|'done'), notes; adjuntos vía common/attachments.
Service: al cerrar una OT actualiza lastService* y recalcula nextDue* del plan. Cron
diario que evalúa planes y, si nextDueKm-currentOdometer <= umbral o nextDueAt
próximo, genera una alerta (vía alerts) y marca el camión como "service próximo".
Endpoints CRUD de planes y OT, listar próximos vencimientos. Guards: MAINTENANCE/
ADMIN gestionan; MANAGER lee. Swagger.
```
**Commit:** `feat: módulo maintenance (preventivo + órdenes de trabajo)`.

### Prompt 6.2 — Front: mantenimiento
```
En front-camion (layout admin) creá /admin/mantenimiento: vista de planes por camión,
próximos servicios resaltados (km/fecha), alta de órdenes de trabajo con costo y
adjuntos, cierre de OT. Store maintenance.ts + composable useMaintenance.ts.
```
**Commit:** `feat(front): mantenimiento`.

---

## FASE 7 — Centro Documental (Módulo #8)

### Prompt 7.1 — Backend de documentos
```
Creá el módulo src/documents. Entidad Document (uuid + auditoría): ownerType
('truck'|'trailer'|'driver'|'company'), ownerId, category('insurance'|'vtv'|
'license'|'id_card'|'permit'|'delivery_note'|'waybill'|'other'), number, issueDate,
expiryDate, fileKey (archivo en S3 vía StorageService/attachments), status
('valid'|'expiring'|'expired', calculado). Endpoints: subir documento con archivo,
CRUD, listar por owner y por categoría, GET /documents/expiring?days=30. Cron diario
que recalcula status y genera alertas verdes (o amarillas si vencido) para los que
vencen dentro de expiryWarningDays. Guards: ABM ADMIN/MAINTENANCE/DISPATCHER; chofer
ve los suyos y los de su camión. Swagger.
```
**Commit:** `feat: módulo documents (centro documental)`.

### Prompt 7.2 — Front: centro documental
```
En front-camion (layout admin) /admin/documentos: gestor por entidad (camión/
acoplado/chofer/empresa) con subida de archivo, fechas y categoría; tablero de
vencimientos (vigente/por vencer/vencido con colores). En la app del chofer,
/chofer/documentos muestra (solo lectura) los documentos suyos y de su unidad para
exhibir en inspecciones. Store document.ts + composable useDocuments.ts.
```
**Commit:** `feat(front): centro documental`.

---

## FASE 8 — Dashboard Gerencial (Módulo #7)

### Prompt 8.1 — Backend del dashboard
```
Reutilizá/recreá src/dashboard con un endpoint GET /dashboard/overview que devuelva
en una sola respuesta: camiones viajando / detenidos / en taller / disponibles
(conteos por status), incidentes abiertos por severidad, gastos del día (suma de
trip-log de hoy), choferes con novedades (con incidente/alerta activa), próximos
mantenimientos (N), viajes demorados (plannedEndAt vencido y status in_progress),
alertas activas por nivel. Optimizá con queries de agregación. Guards: MANAGER/ADMIN/
DISPATCHER. Exponé también un canal WebSocket que reemita cambios relevantes. Swagger.
```
**Commit:** `feat: dashboard gerencial (backend)`.

### Prompt 8.2 — Front: dashboard gerencial
```
En front-camion (layout admin) /admin/dashboard: tarjetas KPI (camiones por estado,
incidentes abiertos, gastos del día, mantenimientos próximos, viajes demorados),
panel de alertas activas (reusar useAlerts), lista de choferes con novedades, todo
con refresco WebSocket. Gráficos con ApexCharts (vue3-apexcharts ya instalado).
Store dashboard.ts + composable useDashboard.ts. Mobile-friendly.
```
**Commit:** `feat(front): dashboard gerencial`.

---

## FASE 9 — Indicadores (Módulo #9)

### Prompt 9.1 — Backend de indicadores + export
```
Creá el módulo src/indicators con endpoints de KPIs que acepten filtros comunes
(camión, chofer, flota, rango de fechas): gasto por kilómetro, gasto por camión,
gasto por chofer, tiempo promedio de resolución de incidentes, cantidad de roturas
(incidentes mecánicos) por unidad, horas detenidas, rendimiento por recorrido
(litros/100km a partir de fuel + distanceKm), costos extraordinarios, disponibilidad
de la flota (% tiempo available). Cada KPI como método de service con su query de
agregación. Endpoints GET /indicators/:kpi y un GET /indicators/export que arma un
Excel (xlsx) o PDF (pdfkit) con los resultados filtrados. Guards: MANAGER/ADMIN/
AUDITOR. Swagger.
```
**Commit:** `feat: módulo indicators (KPIs + export)`.

### Prompt 9.2 — Front: indicadores
```
En front-camion (layout admin) /admin/indicadores: barra de filtros (camión/chofer/
flota/fechas) y grilla de tarjetas + gráficos ApexCharts por KPI, con botón Exportar
(Excel/PDF). Store indicator.ts + composable useIndicators.ts.
```
**Commit:** `feat(front): indicadores`.

---

## FASE 10 — App Chofer / PWA / Push / Offline (Módulo #4)

### Prompt 10.1 — PWA + acceso directo
```
Configurá el front-camion como PWA instalable: manifest (nombre, íconos, theme,
display standalone), service worker (cachea el shell de la app del chofer), y prompt
de "agregar a pantalla de inicio". Asegurá que el layout driver funcione como app
independiente (navegación inferior con: Inicio, Viaje actual, Incidentes, Documentos,
Mensajes). Verificá que el build de Capacitor siga funcionando para el wrapper nativo.
```
**Commit:** `feat(front): PWA instalable para choferes`.

### Prompt 10.2 — Notificaciones push (FCM)
```
Integrá notificaciones push con Firebase Cloud Messaging vía Capacitor en el front y
un servicio de envío en el back (src/notifications/push). Registro de device tokens
por usuario (entidad DeviceToken: userId, token, platform). El AlertsService dispara
push a los roles destino para alertas rojas/naranjas y al chofer para mensajes/
asignaciones de viaje. Endpoints para registrar/borrar token. Documentá las claves
FCM necesarias en .env.example.
```
**Commit:** `feat: notificaciones push FCM`.

### Prompt 10.3 — Mensajería chofer ↔ base
```
Creá el módulo src/messages: Message (uuid + auditoría): tripId(nullable),
fromUserId, toUserId(nullable), toRole(nullable), body, readAt(nullable); adjuntos
vía common/attachments. WebSocket gateway para entrega en vivo + push si offline.
Endpoints: enviar, listar conversación, marcar leído. Front: /chofer/mensajes y un
panel en backoffice. Reemplaza el uso de WhatsApp para coordinación. Guards básicos.
```
**Commit:** `feat: mensajería chofer-base`.

### Prompt 10.4 — Offline-first del chofer (avanzado)
```
Hacé que bitácora, checklist e incidentes funcionen sin conexión en la app del
chofer: cola local (Capacitor Preferences/IndexedDB) que guarda las acciones cuando
no hay red y las sincroniza al recuperar señal, usando el clientId idempotente de los
POST para evitar duplicados. Indicador de "pendiente de sincronizar" por ítem.
Asegurá idempotencia en los endpoints del backend (trip-log, incidents, checklist).
```
**Commit:** `feat(front): modo offline del chofer`.

---

## Checklist de cierre del proyecto

- [ ] Seed con datos de ejemplo (flota, choferes, viajes) para demo.
- [ ] Variables de entorno documentadas (`.env.development` / `.env.production`).
- [ ] Estrategia de migraciones para producción (hoy `synchronize:true` en dev).
- [ ] Pruebas e2e de los flujos críticos (iniciar viaje, cargar gasto, reportar
      incidente, generar liquidación).
- [ ] Hardening de seguridad (rate limit, tamaño de uploads, validación de archivos).
- [ ] Manual rápido para choferes (1 página).
