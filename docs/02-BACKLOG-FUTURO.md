# Backlog de mejoras futuras — FleetLog

> Registro vivo de tareas posibles a realizar más adelante. Se va completando a
> medida que surgen ideas mientras construimos. No es compromiso de alcance: es
> un inventario de oportunidades para priorizar cuando haga falta.
>
> Relacionado: [`00-PLAN-MAESTRO.md`](./00-PLAN-MAESTRO.md) ·
> [`01-PROMPTS-POR-FASE.md`](./01-PROMPTS-POR-FASE.md)

**Convención:** cada ítem usa estado `[ ]` pendiente · `[~]` en curso · `[x]` hecho.
Al cerrar un ítem, mover una línea al historial del Plan Maestro si corresponde.

---

## 1. Combustible (`fuel`)

Estado base: módulo dedicado con carga (chofer/base), reporte por camión y por
chofer alineado con km (km/l, l/100km, costo/km, frecuencia de carga, promedios) y
exportación a Excel. Pendientes:

- [x] **Foto del ticket de carga** vía `attachments` (`entityType='fuel_record'`),
      cableada en el front (`FuelLoadDialog`).
- [ ] **Alertas de consumo anómalo**: disparar alerta amarilla si un camión empeora
      su km/l más de X % respecto a su propio promedio histórico, o si un chofer
      queda por debajo de la media de la flota. Enganchar con módulo `alerts`
      (umbral configurable en `AlertRuleConfig`).
- [ ] **Costo de combustible por viaje**: cruzar `tripId` para reflejarlo en la
      liquidación (`settlements`) y en `indicators`.
- [ ] **Detección de posible robo/fuga de combustible**: cargas que superan la
      capacidad del tanque, o litros cargados sin avance de odómetro coherente.
- [ ] **Precio de referencia / variación**: seguimiento del precio por litro en el
      tiempo y por estación; comparar contra precio promedio.
- [x] **Front**: pantalla de carga del chofer (`/chofer/combustible` +
      `FuelLoadDialog`, con voz y GPS) y tablero `/admin/combustible` con KPIs,
      gráficos (km/l y gasto por camión), tablas por camión/chofer y export Excel.
- [ ] Integrar el rendimiento de combustible al módulo `indicators` existente (hoy
      `fuel` tiene su propio `report`; evaluar unificar o dejar especializado).

## 2. Planilla de control OEA (`oea`)

Estado base: inspección con plantilla de 11 ítems (7 puntos físicos AFIP +
dispositivos de seguridad), datos de transporte/documentación, firma digital,
resultado conforme/no conforme, GPS e idempotencia offline. Pendientes:

- [x] **Fotos por ítem** (precintos, 7 puntos) vía `attachments`
      (`entityType='oea_item'`), cableadas en `OeaItemRow`.
- [ ] **Ajustar plantilla a la planilla manual real** del cliente cuando la provea
      (campos/ítems parametrizados en `DEFAULT_OEA_ITEMS`).
- [ ] **Exportación a PDF** de la planilla firmada (evidencia ante AFIP/aduana),
      reutilizando `pdfkit` + S3 como en `settlements`.
- [ ] **Bloqueo de inicio de viaje** si la planilla OEA no está conforme (similar a
      cómo `checklists` bloquea el inicio). A confirmar si aplica al negocio.
- [ ] **Alertas** ante planilla `no_conforme` (precinto adulterado, lona con cortes).
- [x] **Front**: carga del chofer con `SignaturePad` (`/chofer/oea` lista +
      `/chofer/oea/[id]` completar/firmar) y backoffice `/admin/oea` (rol `AUDITOR`)
      con filtros, listado y diálogo de detalle por secciones.

## 3. General / transversal (lo que vaya surgiendo)

- [ ] **Migraciones de TypeORM**: hoy `synchronize:true`. Antes de producción,
      pasar a migraciones versionadas.
- [ ] **Push real (FCM)**: cargar credenciales e integrar `firebase-admin` en
      `notifications/push` (hoy es scaffold/stub).
- [ ] **Front de choferes tras el refactor Driver=capacidad de Employee**: el alta
      ya no crea User+Driver con nombre/email/password. `DriverFormDialog` y
      `/admin/choferes` deben: (1) elegir un Employee existente (`employeeId`) +
      cargar licencia/estado/notas; (2) mostrar nombre/documento desde `employee`
      (y email desde `employee.user`), no desde `driver.user`. Editar dato personal
      lleva a `/admin/rrhh` (PATCH /hr/employees/:id). Revisar también selects de
      chofer en viajes/indicadores/combustible/OEA que leían `d.user?.name` →
      ahora `employee.firstName + lastName`.
- [ ] **Front de RRHH con alta de cuenta**: `EmployeeFormDialog`/`/admin/rrhh`
      con un toggle "crear acceso a la app" que muestre email + contraseña; el rol
      se deriva del puesto (mostrar el rol resultante), con opción de override.
      Agregar el puesto **Gerente** (manager) al selector de puestos.
- [~] **Planilla pre-viaje estilo RIP 06 09 01 (checklist OEA de cliente).**
      **Backend hecho** (migración `1788100000000-ChecklistRip`): la plantilla pasa a
      tener `code`/`revision`/`revisionDate` (y cada checklist emitido guarda copia
      de esa identidad); los ítems suman `section`, `helpText`, `type`
      (condition/ack/photo/text), `expectedAnswer` (polaridad: «¿tiene pérdidas?»
      espera NO), `requiresPhoto`/`minPhotos`/`maxPhotos` y
      `requiresValidationOnFail`; el checklist suma `trailerId`, `notes`, `lat`/`lng`,
      `clientId` (idempotencia offline) y el circuito de **validación de Tráfico**
      (`PENDING_VALIDATION` + `validatedBy`/`validatedAt`/`validationNotes`, endpoints
      `POST /checklists/:id/validate` y `GET /checklists/pending-validation`); tabla
      nueva `checklist_companions` (acompañantes con documento y seguro) con
      `POST /checklists/:id/companions`. Siete ajustes nuevos en el grupo `checklist`
      de `settings.catalog.ts`, todos con el default en el comportamiento actual.
      **Front hecho** (Nuxt build OK): `stores/checklist.ts` con tipos nuevos,
      agrupación por bloque, conteo de fotos por punto y acciones de acompañantes,
      firma con GPS y validación; `stores/checklistTemplate.ts` con código/revisión
      y los flags por punto; `ChecklistItemRow.vue` dibuja los cuatro tipos de punto
      y respeta la polaridad (con respuesta esperada NO, los botones pasan a Sí/No y
      el color marca cuál es la mala); `ChecklistCompanions.vue` nuevo;
      `/chofer/viaje/[id]/checklist` por bloques, con observaciones generales,
      ubicación al firmar y el cartel de «esperando validación de Tráfico»;
      `SettingsChecklist.vue` con la identidad del formulario y un diálogo de
      opciones por punto; `/admin/validaciones` es la bandeja de Tráfico (ítem nuevo
      en el sidebar, sección Operación). Se agregó `settings.boolCon(key, default)`
      porque `bool()` supone `false` ante un ajuste no cargado y `allowCompanion`
      vale `true` por defecto: sin eso, el bloque de acompañantes desaparecía en la
      app del chofer sin señal.
      **Acompañante que ya está en el sistema:** `ChecklistCompanion.employeeId` +
      `idDocumentOnFile`. Si el acompañante es otro chofer, el nombre y el documento
      se copian del legajo (el servidor los pisa, no los acepta del cliente) y, si
      tiene su DNI cargado como `Document` de categoría `id_card`, la app deja de
      pedir la foto. Endpoint `GET /checklists/companion-candidates?search=`, que
      devuelve nombre, puesto y `hasIdDocument` —nunca el número de documento: el
      chofer necesita elegir a alguien, no leer los datos de sus compañeros—.
      **Pendiente:**
      (1) **seed opcional** de una plantilla RIP de ejemplo para demos;
      (2) **equipo de frío como concepto propio** — hoy se modela como una sección de
      la plantilla con sus ítems, que alcanza para la planilla; si más adelante hacen
      falta temperatura, horas de equipo o alarmas del reefer, eso pide un modelo
      propio en `fleet` (flag de refrigerado en `Trailer` + lecturas), no más ítems.
- [~] **Clasificación de ruta en viajes**: `Trip.classification` contra el catálogo
      nuevo `trip_classification` (el sistema trae «Nacional» e «Internacional»; cada
      empresa arma las suyas: «Ida Brasil», «Vuelta Brasil»…). Front: selector en
      `TripFormDialog` y el catálogo en `stores/catalog.ts` con su fallback; la
      pantalla de catálogos ya lo lista sola porque se dibuja desde el back.
      **Falta:** filtrar por clasificación en `/admin/viajes` y abrir por ella en
      indicadores, que es donde la clasificación empieza a pagar.
- [ ] (agregar aquí nuevas ideas a medida que aparezcan)

---

_Última actualización: 2026-09-07._
