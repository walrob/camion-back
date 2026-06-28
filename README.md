# 🚛 FleetLog — Backend de Gestión de Flota de Camiones

Backend del sistema de gestión de flota para una empresa de camiones con flota
grande. Reemplaza el cuaderno del chofer y los grupos de WhatsApp por una
plataforma **web mobile-first** con acceso directo desde el celular.

> Este backend nació como copia de un sistema e-commerce y se está reconvirtiendo
> al dominio de flota. La hoja de ruta completa y los prompts para construirlo por
> partes están en **[`docs/00-PLAN-MAESTRO.md`](./docs/00-PLAN-MAESTRO.md)** y
> **[`docs/01-PROMPTS-POR-FASE.md`](./docs/01-PROMPTS-POR-FASE.md)**.

---

## 📊 Resumen

Cada chofer registra el viaje desde el celular (bitácora, gastos, incidentes,
checklist) y la oficina obtiene visibilidad en tiempo real (alertas priorizadas,
dashboard, indicadores y liquidaciones automáticas).

### Objetivos

- ✅ Cero pérdida de datos del viaje (todo con fecha, hora y autor).
- ✅ Liquidaciones más rápidas (la rendición se arma desde la bitácora).
- ✅ Atención por prioridad (alertas rojas/naranjas/amarillas/verdes).
- ✅ Evidencia ante inspecciones (checklists con fotos, documentación al día).
- ✅ Visibilidad gerencial (dashboard e indicadores por camión/chofer/flota).

---

## 🧩 Módulos del sistema

| # | Módulo | Descripción |
|---|--------|-------------|
| 1 | **Bitácora Digital del Viaje** | Combustible, peajes, gastos, adelantos, reparaciones, multas, viáticos, km, fotos de comprobantes, observaciones |
| 2 | **Centro de Incidentes** | Rotura, accidente, falta de dinero, retraso, problema de carga/cliente, emergencia — con foto/GPS/audio/video y estados |
| 3 | **Alertas Inteligentes** | Prioriza 🔴 accidente / 🟠 camión detenido / 🟡 exceso de gasto / 🟢 documentación |
| 4 | **App del Chofer** | Experiencia móvil (PWA + Capacitor) que agrupa viajes, bitácora, incidentes, checklist, mensajes, documentos y firma |
| 5 | **Checklist pre-viaje** | Luces, frenos, cubiertas, aceite, matafuego, documentación, acoplado — con fotos y firma |
| 6 | **Mantenimiento Preventivo** | Control por km/horas/fecha con avisos automáticos |
| 7 | **Dashboard Gerencial** | Camiones viajando/detenidos, incidentes abiertos, gastos del día, novedades, mantenimientos, demoras |
| 8 | **Centro Documental** | Seguro, VTV, licencias, carnet, habilitaciones, remitos, cartas de porte — con vencimientos automáticos |
| 9 | **Indicadores** | Gasto por km/camión/chofer, resolución de incidentes, roturas, horas detenidas, rendimiento, disponibilidad |
| 10 | **RRHH (Personal)** | Legajos del personal, asignación chofer↔camión y permisos/habilitaciones con vencimiento (carnet, carga peligrosa, psicofísico, LiNTI…) |

---

## 🎓 Tecnologías

```
Framework:        NestJS 11
ORM:              TypeORM 0.3 (MySQL)
Autenticación:    JWT + roles (admin, manager, dispatcher, maintenance, driver, hr, auditor)
Validación:       class-validator / class-transformer
Archivos:         AWS S3 (StorageService) + sharp (compresión)
Tiempo real:      WebSockets (socket.io) — alertas, incidentes, dashboard
Tareas cron:      @nestjs/schedule — vencimientos, mantenimiento, "camión detenido"
Notificaciones:   Email (nodemailer) + Push (FCM vía Capacitor, planificado)
Reportes:         pdfkit (liquidaciones) + xlsx (indicadores)
Docs API:         Swagger
Frontend:         Nuxt 3 + Vuetify 3 + Pinia (carpeta ../front-camion, con Capacitor)
```

> **Frontend** (`../front-camion`, misma raíz): dos experiencias sobre un solo
> proyecto — *App del Chofer* (layout `driver`, mobile-first con bottom-nav) y
> *Backoffice/Gerencial* (layout `admin`). Reutiliza componentes existentes:
> **`<ResponsiveTable>`** (tablas que se vuelven tarjetas en móvil) y los inputs de
> **dictado por voz** `<VoiceTextField>` / `<VoiceTextarea>` (el chofer carga datos
> hablando, sin teclear en ruta). Geolocalización por GPS del celular
> (`useGeolocation`). Detalle en [`docs/00-PLAN-MAESTRO.md` §10](./docs/00-PLAN-MAESTRO.md).

---

## 🗺️ Hoja de ruta (fases)

El proyecto se construye en fases independientes y autocontenidas para poder
ejecutarlas en sesiones separadas:

> ✅ **Estado: las 10 fases están implementadas y compilando** (backend NestJS +
> frontend Nuxt). Pendiente para producción: cargar credenciales **FCM** para el push
> real (hoy scaffold) y reemplazar `synchronize:true` por migraciones.

| Fase | Entrega | Estado |
|------|---------|--------|
| 0 | Fundaciones (limpieza, roles, attachments, base front) | ✅ |
| 1 | Flota & Choferes | ✅ |
| 1B | RRHH (legajos, permisos/vencimientos, asignación chofer↔camión) | ✅ |
| 2 | Viajes + Bitácora + Liquidaciones | ✅ |
| 3 | Checklist pre-viaje (firma digital) | ✅ |
| 4 | Centro de Incidentes (WebSocket en vivo) | ✅ |
| 5 | Alertas Inteligentes (motor + cron + WS) | ✅ |
| 6 | Mantenimiento Preventivo | ✅ |
| 7 | Centro Documental | ✅ |
| 8 | Dashboard Gerencial | ✅ |
| 9 | Indicadores (+ export Excel) | ✅ |
| 10 | PWA + Mensajería + Offline-first + Push (scaffold) | ✅ |

👉 Detalle y prompts copiables: [`docs/01-PROMPTS-POR-FASE.md`](./docs/01-PROMPTS-POR-FASE.md)

> **Buenas prácticas** (obligatorias en todas las fases): componentes y funciones
> pequeños de responsabilidad única, DRY (reutilizar antes de crear), controllers
> delgados con la lógica en services, DTOs validados, tipado estricto y commits
> atómicos por feature. Detalle en [`docs/00-PLAN-MAESTRO.md` §11](./docs/00-PLAN-MAESTRO.md).

---

## 🚀 Puesta en marcha

```bash
npm install
# configurar .env.development (DB, JWT, AWS S3, SMTP)
npm run start:dev      # desarrollo con watch
npm run build          # build de producción
npm run start:prod     # ejecutar build
```

Requisitos: Node.js 18+, MySQL. Variables de entorno en `.env.development` /
`.env.production` (base de datos, JWT, AWS S3, SMTP).
