# Plan Maestro — Sistema de Gestión de Flota de Camiones

> Nombre de trabajo del producto: **FleetLog** (provisional, a confirmar).
> Documento de arquitectura y hoja de ruta. Los prompts ejecutables están en
> [`01-PROMPTS-POR-FASE.md`](./01-PROMPTS-POR-FASE.md).

---

## 1. Visión

Reemplazar el cuaderno del chofer y los grupos de WhatsApp por un **sistema web
mobile-first** para una empresa con flota grande de camiones. Cada usuario
(chofer, despachante, gerente, taller) accede desde el celular con un **acceso
directo** (PWA "agregar a pantalla de inicio" + envoltura nativa con Capacitor ya
presente en el front) o desde el navegador de escritorio.

Objetivos de negocio:

- **Cero pérdida de datos** del viaje (todo con fecha, hora y autor).
- **Liquidaciones más rápidas** (la rendición se arma sola desde la bitácora).
- **Atención por prioridad** (alertas inteligentes en vez de cientos de mensajes).
- **Auditoría y evidencia** ante inspecciones (checklists con fotos, documentación).
- **Visibilidad gerencial** en tiempo real (dashboard + indicadores).

---

## 2. Stack actual (reutilizado)

Este backend es copia de un sistema e-commerce/producción textil. **Se reaprovecha
la base técnica y se reemplaza el dominio.**

| Capa | Tecnología | Estado |
|------|-----------|--------|
| Backend | NestJS 11 + TypeORM 0.3 + MySQL (`synchronize:true`) | ✅ reutilizar |
| Auth | JWT (`@nestjs/jwt`) + `Role` enum + guards/decorators (`@Auth`, `@Public`, `@Roles`) | ♻️ refactor de roles |
| Archivos | AWS S3 (`StorageService`, guarda *key*, URLs prefirmadas) | ✅ reutilizar y extender |
| Tiempo real | WebSockets (`socket.io`) | ✅ usar para alertas/mensajes |
| Tareas programadas | `@nestjs/schedule` (cron) | ✅ usar para vencimientos/mantenimiento/idle |
| Email | `@nestjs-modules/mailer` + nodemailer | ✅ usar para notificaciones |
| Reportes | `pdfkit` + `xlsx` | ✅ usar para liquidaciones/indicadores |
| Imágenes | `sharp` | ✅ comprimir comprobantes/fotos |
| Docs API | `@nestjs/swagger` | ✅ mantener |
| Frontend | Nuxt 3 + Vuetify 3 + Pinia + composables (`useApi`) | ♻️ nuevas pantallas |
| Móvil | **Capacitor 7** + `@capacitor/preferences` | ✅ envoltura nativa + push |
| Gráficos | ApexCharts (`vue3-apexcharts`) | ✅ dashboard/indicadores |

**Convenciones de código a respetar** (ver `src/clients` como plantilla):

- Cada feature = módulo NestJS: `*.module.ts`, `*.controller.ts`, `*.service.ts`,
  carpetas `dto/` y `entities/`.
- Entidades: PK `@PrimaryGeneratedColumn('uuid')` + columnas de auditoría
  `createdAt/createdBy/updatedAt/updatedBy/deletedAt/deletedBy` (soft delete).
- DTOs con `class-validator` / `class-transformer`.
- Front: una `store` Pinia + un `composable` `useXxx` por dominio, layouts por rol.

---

## 3. Roles y permisos

Se reemplaza el `Role` enum actual (`admin/seller/production/operator`) por:

| Rol | Descripción | Accesos principales |
|-----|-------------|---------------------|
| `ADMIN` | Administrador del sistema | Todo, ABM de usuarios y flota |
| `MANAGER` (gerente) | Dirección/dueños | Dashboard, indicadores, sólo lectura operativa |
| `DISPATCHER` (despachante/coordinador) | Asigna viajes, atiende incidentes/alertas | Viajes, incidentes, alertas, mensajes |
| `MAINTENANCE` (taller) | Mantenimiento y reparaciones | Mantenimiento, órdenes de trabajo, documentación de unidades |
| `DRIVER` (chofer) | Conductor en ruta | Sus viajes, bitácora, checklist, incidentes, mensajes, documentos |
| `HR` (RRHH) | Recursos Humanos | Legajos del personal, permisos/vencimientos, asignación chofer↔camión |
| `AUDITOR` | Auditoría/administración contable | Lectura de bitácoras, liquidaciones, indicadores, export |

> El chofer es además un **User** con perfil extendido (`Driver`), y a su vez un
> **`Employee`** (legajo) del módulo de RRHH.

---

## 4. Mapa de módulos

```
Backend (NestJS)                         Cobertura de la idea original
────────────────────────────────────    ─────────────────────────────
common/attachments  (S3 polimórfico)     soporte fotos/audio/video/pdf
fleet     (trucks, trailers, fleets)     (base para todo)
hr        (legajos, permisos, asignación) RRHH del personal
drivers   (perfil operativo del chofer)  parte de #4
trips     (viajes asignados)             base de #1, #4
trip-log  (bitácora + gastos)            #1 Bitácora Digital
settlements (liquidación/rendición)      beneficio de #1
checklists (inspección pre-viaje)        #5 Checklist
incidents (centro de incidentes)         #2 Incidentes
alerts    (motor de reglas + push)       #3 Alertas Inteligentes
maintenance (preventivo + OT)            #6 Mantenimiento
documents (centro documental)            #8 Centro Documental
geolocation (pings GPS, opcional)        soporte #3 (camión detenido)
messages  (mensajería chofer↔base)       parte de #4
dashboard (gerencial)                    #7 Dashboard
indicators (KPIs + export)               #9 Indicadores
notifications (email/push/ws)            transversal

Frontend (Nuxt + Vuetify + Capacitor)
────────────────────────────────────
layout "driver"  → App del Chofer        #4 App para Choferes (PWA/nativa)
layout "admin"   → Backoffice/gerencial  #7, #8, #9, ABMs
PWA + push (FCM) + offline queue         acceso directo en celular
```

> **Sobre el Módulo #4 "App para Choferes":** no es un módulo de backend nuevo,
> es la **experiencia móvil** del chofer que **agrupa** features ya existentes
> (viajes, bitácora, incidentes, checklist, mensajes, documentos, firma, fotos).
> Se materializa como un layout/contenedor en el front + PWA/Capacitor. Así se
> evita la duplicación que el propio brief anticipaba.

---

## 5. Modelo de datos (resumen)

Entidades núcleo y relaciones principales (todas con auditoría + soft delete):

- **Fleet** (flota): `name`, `code`, `notes`.
- **Truck** (camión/unidad): `plate`, `internalNumber`, `brand`, `model`, `year`,
  `type`, `loadCapacityKg`, `currentOdometerKm`, `engineHours`, `status`
  (`available|on_trip|stopped|workshop|out_of_service`), `fleetId`.
- **Trailer** (acoplado): `plate`, `type`, `loadCapacityKg`, `status`.
- **Employee** (legajo / RRHH): `userId?` (1:1 con User si tiene acceso al sistema),
  `firstName`, `lastName`, `documentId` (DNI/CUIL), `birthDate`, `position`
  (`driver|mechanic|dispatcher|admin|other`), `hireDate`, `terminationDate?`,
  `employmentStatus` (`active|on_leave|suspended|terminated`), `phone`, `address`,
  `emergencyContactName`, `emergencyContactPhone`, `photoKey?`, `notes`.
- **Certification** (permiso/habilitación del personal con vencimiento): `employeeId`,
  `type` (`driving_license` carnet, `professional_license` LiNTI/CNRT,
  `dangerous_goods` carga peligrosa, `medical_exam` psicofísico, `hazmat`,
  `crane_operator`, `defensive_driving`, `first_aid`, `other`), `class?`/`category?`
  (ej. clase del carnet), `number`, `issuedBy`, `issueDate`, `expiryDate`, `fileKey`
  (vía attachments), `status` (`valid|expiring|expired`, calculado), `notes`.
- **TruckAssignment** (asignación chofer↔camión, con historial): `employeeId` (o
  `driverId`), `truckId`, `assignedAt`, `unassignedAt?`, `isPrimary`, `notes`.
- **Driver** (perfil operativo del chofer): `employeeId` (1:1 con Employee),
  `userId` (1:1 con User), `status` (`active|on_trip|inactive`). Los datos
  personales viven en `Employee` y los carnets/permisos en `Certification`
  (el carnet ya no es un campo suelto del Driver).
- **Trip** (viaje): `code`, `truckId`, `trailerId?`, `driverId`, `clientId?`,
  `origin`, `destination`, `cargoDescription`, `plannedStartAt`, `plannedEndAt`,
  `startedAt`, `finishedAt`, `startOdometerKm`, `endOdometerKm`, `distanceKm`,
  `status` (`assigned|in_progress|finished|canceled`), `notes`.
- **TripLogEntry / Expense** (bitácora): `tripId`, `type`
  (`fuel|toll|expense|cash_advance|repair|fine|per_diem|other`), `amount`,
  `currency`, `liters?`, `odometerKm?`, `lat?`, `lng?`, `occurredAt`, `notes`,
  `attachments[]` (comprobantes).
- **Settlement** (liquidación): `tripId` (o por chofer/período), totales por tipo,
  adelantos, neto a rendir, `status` (`draft|closed`), PDF generado.
- **Checklist** (inspección pre-viaje): `tripId`, `truckId`, `driverId`, `items[]`
  (luces, frenos, cubiertas, aceite, matafuego, documentación, acoplado…) cada uno
  con `status` (`ok|fail|na`) + foto, `result` (`approved|rejected`),
  `signatureKey` (firma digital), `signedAt`.
- **Incident** (incidente): `tripId?`, `truckId`, `driverId`, `type`
  (`mechanical|accident|cash_shortage|delay|cargo_issue|client_issue|emergency`),
  `severity`, `status` (`pending|in_progress|resolved`), `assignedToUserId`,
  `lat/lng`, `description`, `attachments[]` (foto/audio/video), `timeline[]`.
- **Alert** (alerta): `level` (`red|orange|yellow|green`), `type`, `sourceType`
  (`incident|expense|document|truck_idle|maintenance`), `sourceId`, `title`,
  `message`, `status` (`new|seen|acknowledged|resolved`), `targetRoles[]`,
  `createdAt`.
- **MaintenancePlan** (plan preventivo): `truckId`, `name`, `triggerType`
  (`km|hours|date`), `intervalValue`, `lastServiceKm/At`, `nextDueKm/At`, `status`.
- **MaintenanceOrder** (orden de trabajo): `truckId`, `planId?`, `date`,
  `odometerKm`, `items[]`, `cost`, `notes`, `attachments[]`.
- **Document** (centro documental): `ownerType` (`truck|trailer|driver|company`),
  `ownerId`, `category` (`insurance|vtv|license|id_card|permit|delivery_note|
  waybill|other`), `number`, `issueDate`, `expiryDate`, `fileKey`, `status`
  (`valid|expiring|expired`).
- **Attachment** (genérico/polimórfico): `entityType`, `entityId`, `kind`
  (`image|audio|video|pdf`), `s3Key`, `mime`, `sizeBytes`, `uploadedBy`.
- **GeoPing** (opcional): `truckId`, `tripId?`, `lat`, `lng`, `speed`, `at`.
- **Message** (mensajería): `tripId?`, `fromUserId`, `toUserId/role`, `body`,
  `attachments[]`, `readAt`.

Los **Indicadores (#9)** no son una entidad: son consultas de agregación sobre
trips + trip-log + incidents + maintenance, con filtros por camión/chofer/flota.

---

## 6. Decisiones transversales

1. **Mobile-first / acceso directo**: PWA instalable (manifest + service worker) y
   build nativo con Capacitor ya presente. Un único frontend, dos experiencias por
   layout (`driver` vs `admin`).
2. **Notificaciones push**: FCM (Firebase Cloud Messaging) vía Capacitor para
   alertas rojas/naranjas; email como respaldo; WebSocket para refresco en vivo del
   dashboard y panel de alertas.
3. **Offline-first del chofer** (fase avanzada): la bitácora, el checklist y los
   incidentes se guardan localmente (`@capacitor/preferences` / IndexedDB) y se
   sincronizan al recuperar señal. Crítico por zonas sin cobertura. Requiere
   `clientId`/idempotencia en los POST.
4. **Archivos**: todo comprobante/foto pasa por `sharp` (compresión) y se sube a S3
   vía `Attachment`. Audio/video se suben tal cual con límite de tamaño.
5. **Motor de alertas**: servicio de reglas + cron (`@nestjs/schedule`). Reglas:
   accidente→roja inmediata; camión detenido > X h→naranja; gasto fuera de umbral→
   amarilla; documento por vencer→verde. Umbrales configurables.
6. **Auditoría**: columnas `*By` + `Attachment.uploadedBy`; opcional `ActivityLog`.
7. **Multi-moneda** en gastos (`currency`, default `ARS`).
8. **Soft delete** en todo; nada se borra físicamente.

---

## 7. Hoja de ruta por fases

Cada fase es **independiente y autocontenida** para poder ejecutarla en sesiones
separadas (ver prompts en `01-PROMPTS-POR-FASE.md`). Orden recomendado:

| Fase | Nombre | Entrega | Depende de |
|------|--------|---------|-----------|
| **0** | Fundaciones | Limpieza del dominio e-commerce, roles, `Attachment`, enums | — |
| **1** | Flota & Choferes | `fleet`, `drivers` + ABM front | 0 |
| **1B** | RRHH (Personal) | `hr`: legajos, permisos/vencimientos, asignación chofer↔camión | 1 |
| **2** | Viajes + Bitácora (#1) | `trips`, `trip-log`, `settlements` + front chofer | 1, 1B |
| **3** | Checklist pre-viaje (#5) | `checklists` con fotos + firma | 1 |
| **4** | Centro de Incidentes (#2) | `incidents` + adjuntos (foto/audio/video/GPS) | 1 |
| **5** | Alertas Inteligentes (#3) | motor de reglas + cron + WS + push | 2,3,4 |
| **6** | Mantenimiento (#6) | `maintenance` (plan + OT) + avisos | 1 |
| **7** | Centro Documental (#8) | `documents` + vencimientos automáticos | 1 |
| **8** | Dashboard Gerencial (#7) | `dashboard` con tiempo real | 2,4,6,7 |
| **9** | Indicadores (#9) | KPIs con filtros + export PDF/Excel | 2,4,6 |
| **10** | App Chofer / PWA / Push / Offline (#4) | layout driver, PWA, FCM, sync offline | 2,3,4 |

> Se puede entregar valor desde la Fase 2 (bitácora ya elimina el cuaderno).

---

## 8. Definición de "Hecho" (Definition of Done) por fase

- Entidades con migración efectiva (`synchronize` en dev; documentar para prod).
- Endpoints con Swagger, validación DTO y guards por rol.
- Pantalla(s) front conectadas vía composable + store, responsive móvil.
- Seed/datos de ejemplo para probar.
- README/sección de docs actualizada con los endpoints nuevos.

---

## 9. Decisiones (confirmadas y abiertas)

**Confirmadas:**

1. ✅ **Una sola empresa** — **no** se implementa multi-tenant. Sin columna/lógica
   de `tenantId`; se simplifican entidades y guards.
2. ✅ **Geolocalización por celular del chofer** — se usa la Web Geolocation API del
   dispositivo (`navigator.geolocation`, ya en uso en `AddressWithGeo.vue`) /
   Capacitor Geolocation. **No** hay hardware de telemetría en el camión. El
   `lat/lng` se captura en el momento de cada evento (gasto, incidente, inicio/fin
   de viaje). La regla "camión detenido" se evalúa por **falta de avance de
   odómetro / ausencia de eventos del chofer** durante > X horas (no por geocercas).
3. ✅ **Sin reglas de viáticos/adelantos por convenio (todavía)** — `settlements`
   sólo **agrega y resta** lo cargado en la bitácora (gastos rendidos − adelantos =
   neto). No se calculan viáticos automáticos por ahora; se deja el módulo
   preparado para sumar reglas más adelante.

**Abiertas (con valor por defecto asumido):**

4. **Nombre del producto** — *FleetLog* (provisional).
5. **Idioma de datos** — código en inglés, UI en español.
6. **Proveedor de push** — FCM (gratis y compatible con Capacitor).
7. **Acoplados** — se modelan como **unidad independiente** (`Trailer`) y se asocian
   al viaje; reversible si se prefiere atributo del viaje.

---

## 10. Arquitectura del Frontend (`../front-camion`)

El frontend vive en la **misma raíz** que el backend (`Camiones/front-camion`,
hermano de `back-camion`). Es un Nuxt 3 + Vuetify 3 + Pinia con envoltura Capacitor.
**Regla de oro: reutilizar lo existente antes de crear nada nuevo.**

### 10.1 Dos experiencias, un solo frontend

| Experiencia | Layout | Usuarios | Navegación |
|-------------|--------|----------|------------|
| **App del Chofer** | `layouts/driver.vue` | rol `DRIVER` | Barra inferior (bottom nav) con íconos grandes, pensada para una mano y poca señal |
| **Backoffice / Gerencial** | `layouts/admin.vue` | `ADMIN`, `MANAGER`, `DISPATCHER`, `MAINTENANCE`, `AUDITOR` | Sidebar vertical existente (`vertical-sidebar`), menú por `sidebarItem.ts` filtrado por rol |

El `middleware/auth.global.ts` redirige según rol: `DRIVER` → `/chofer`, el resto →
`/admin`. Cada página declara su layout con `definePageMeta({ layout: 'driver' | 'admin' })`.

### 10.2 Componentes reutilizables (NO reinventar)

Estos componentes ya existen y **deben reutilizarse** en todas las pantallas nuevas:

| Componente | Uso obligatorio en | API principal |
|------------|--------------------|---------------|
| **`<ResponsiveTable>`** (`components/ResponsiveTable.vue`) | **Toda** lista/tabla (flota, choferes, viajes, incidentes, alertas, documentos, indicadores) | props `headers: {title,value,minWidth?}[]`, `items`, `loading`, `noDataText`, `allItems`. Reenvía slots de `v-data-table` (`item.<col>`, `bottom`) + slots `mobile-item` y `item.actions`. En móvil renderiza tarjetas automáticamente → ideal para el chofer |
| **`<VoiceTextField>`** (`components/form/VoiceTextField.vue`) | **Todos** los campos de texto corto donde el chofer escribe poco: observaciones de gasto, notas de checklist, descripción breve, búsqueda | v-model; props `lang='es-AR'`, `continuous=false`, `appendMode='replace'`. Reenvía atributos al `v-text-field` (label, rules, density…). Botón de micrófono integrado (Web Speech API vía `useSpeechInput`) |
| **`<VoiceTextarea>`** (`components/form/VoiceTextarea.vue`) | **Todos** los textos largos: descripción de incidente, observaciones del viaje, notas de OT de mantenimiento | v-model; props `lang='es-AR'`, `continuous=true`, `appendMode='append'`. Dictado continuo, ideal en ruta sin teclear |
| `<modal/Confirm>` | Confirmaciones de borrado/cambio de estado | — |
| `<modal/File>`, `<modal/ImageCropper>`, `<list/Files>` | Subida/visualización de comprobantes y fotos | — |
| `<form/InputFecha>` | Fechas (vencimientos, fechas de viaje) | — |
| `<shared/EditableField>` | Edición inline | — |
| `<shared/Loading>`, `UiParentCard`, `UiChildCard` | Estados de carga y contenedores | — |

> **Dictado por voz**: el chofer en la cabina muchas veces no puede teclear. Por eso
> **todos los inputs de texto del rol DRIVER usan `VoiceTextField`/`VoiceTextarea`**
> en lugar de `v-text-field`/`v-textarea` planos. En backoffice se usan también para
> agilizar la carga.

### 10.3 Patrones de datos

- **`useApi()`** (`composables/useApi.ts`): wrapper de `$api` con `get/post/patch/
  delete` y manejo de error homogéneo. Usar siempre, no llamar `$api` directo en
  componentes.
- **Stores Pinia** (uno por dominio): estado + `loading` + `pagination`
  (`{totalItems, itemCount, itemsPerPage, totalPages, currentPage}`) + acciones.
  Params de listado estándar: `{ limit, page, search, ...filtros }`. Errores/éxitos
  vía `useGeneralStore` (`setSuccessSnackbar`, `setErrorSnackbar`,
  `setErrorDataSnackbar`). Ver `stores/client.ts` como plantilla.
- **Composable `useXxx`** por dominio para encapsular llamadas y lógica de vista.
- **Validaciones**: `useValidations()` (`r.isRequired`, etc.).
- **Tipos** en `~/types/project` y `~/types/enums` (agregar los del dominio flota).

### 10.4 Geolocalización (celular del chofer)

Reutilizar el patrón ya presente en `components/form/AddressWithGeo.vue`:
`navigator.geolocation.getCurrentPosition(...)` con timeout y sin bloquear el
formulario si el usuario deniega el permiso. Encapsularlo en un composable
**`useGeolocation()`** reutilizable (devuelve `{ lat, lng, getPosition() }`) y usarlo
al: iniciar/finalizar viaje, cargar un gasto y reportar un incidente. En el wrapper
Capacitor usar `@capacitor/geolocation` con fallback a la Web API.

### 10.5 Captura de fotos/comprobantes

Input `type="file"` con `capture="environment"` (cámara trasera) + compresión con
`ImageCropper`/canvas antes de subir, o `@capacitor/camera` en el build nativo. Las
imágenes se suben al endpoint del módulo común de `attachments` del backend.

### 10.6 Mapa de páginas

```
App del Chofer (layout driver)            Backoffice (layout admin)
─────────────────────────────────         ─────────────────────────────────
/chofer                  home/viajes      /admin/dashboard      gerencial
/chofer/viaje/[id]       bitácora         /admin/flota          camiones/acoplados
/chofer/viaje/[id]/checklist  pre-viaje   /admin/choferes       choferes
/chofer/incidente/nuevo  reportar         /admin/viajes         asignación
/chofer/incidentes       mis incidentes   /admin/incidentes     tablero kanban
/chofer/documentos       mis docs (RO)    /admin/alertas        bandeja priorizada
/chofer/mensajes         mensajería       /admin/mantenimiento  planes + OT
                                          /admin/documentos     centro documental
                                          /admin/rrhh           personal/permisos
                                          /admin/liquidaciones  rendiciones
                                          /admin/indicadores    KPIs + export
```

> Cada fase del documento de prompts incluye su(s) pantalla(s) front usando estos
> componentes y patrones. La barra de navegación se configura en `sidebarItem.ts`
> (backoffice) y en un componente de bottom-nav nuevo para el chofer.

---

## 11. Buenas prácticas de desarrollo (obligatorias)

Todo el código —backend y frontend— debe seguir estas prácticas. Están incluidas
también en el preámbulo de los prompts para que cada fase las respete.

### 11.1 Generales

- **Responsabilidad única (SRP) y DRY**: cada archivo/clase/función hace una sola
  cosa. Antes de escribir algo nuevo, **reutilizar** lo existente (componentes,
  composables, `common/`, services).
- **Componentes y funciones pequeños**: como guía, componentes Vue y services
  acotados (idealmente < ~250–300 líneas); si crecen, **extraer** subcomponentes /
  helpers. Nada de "archivos Dios".
- **Nombres claros y consistentes** con el código de alrededor; tipado estricto,
  evitar `any` salvo casos justificados.
- **Manejo de errores homogéneo** (NestJS exceptions en back; `useApi` + snackbars en
  front). Nunca tragar errores en silencio.
- **Commits chicos y atómicos** por feature (uno por prompt), con mensaje claro.
- **Tests** en los flujos críticos (iniciar/finalizar viaje, cargar gasto, reportar
  incidente, liquidar, vencimientos).

### 11.2 Backend (NestJS)

- Módulos cohesivos (`module/controller/service/dto/entities`); **controllers
  delgados**, la lógica vive en services.
- **DTOs validados** con `class-validator`; nunca confiar en el body crudo.
- Reutilizar `common/` (storage, attachments, decorators, enums). Guards por rol con
  `@Auth`/`@Roles`. Documentar en Swagger.
- Queries de agregación para indicadores/dashboard (no traer todo a memoria).

### 11.3 Frontend (Nuxt + Vuetify)

- **Composición de componentes pequeños**: cada pantalla compone piezas chicas
  (tabla, fila, diálogo de alta/edición, filtros) extraídas a sus propios componentes
  reutilizables, no un único `.vue` gigante.
- **Reutilizar siempre**: `<ResponsiveTable>`, `<VoiceTextField>`/`<VoiceTextarea>`,
  `<modal/Confirm>`, `<form/InputFecha>`, `useApi`, stores Pinia, `useValidations`,
  `useGeolocation`.
- Lógica de datos en stores/composables, **no** en los componentes de vista.
- Mobile-first y accesible (botones grandes para el chofer, contraste, `aria-label`).
