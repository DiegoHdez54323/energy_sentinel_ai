# Energy Sentinel AI — Backend (Node/Express + TypeScript)

## Estructura modular propuesta, responsabilidades por módulo y orden recomendado de implementación

## 1. Objetivo

Definir una estructura modular para el backend en Node.js (Express) con TypeScript, Prisma y PostgreSQL, de manera que el desarrollo pueda realizarse por etapas y módulos independientes (ideal para iterar con Codex sin generar un monolito difícil de entender).

---

## 2. Principios de diseño

- **Separación por dominio (módulos verticales):** auth, homes, devices, shelly, telemetry, anomalies, notifications.
- **Separación por capas:** routes → controller → service → (client/mapper/repo).
- **Jobs aislados:** polling, agregación, baseline, anomalías, notificaciones.
- **Cada módulo debe ser construible y demostrable de forma incremental.**
- **Evitar lógica en routes;** la lógica vive en services y se apoya en mappers/clients.

---

## 3. Estructura de carpetas (propuesta)

```txt
src/
  app.ts
  server.ts
  config/
  db/
  common/
    errors/
    middleware/
    utils/
  modules/
    auth/
      auth.routes.ts
      auth.controller.ts
      auth.service.ts
      auth.schemas.ts
    homes/
      homes.routes.ts
      homes.controller.ts
      homes.service.ts
      homes.schemas.ts
    devices/
      devices.routes.ts
      devices.controller.ts
      devices.service.ts
      devices.schemas.ts
    shelly/
      shelly.routes.ts
      shelly.controller.ts
      shelly.service.ts
      shelly.client.ts
      shelly.mapper.ts
      shelly.schemas.ts
    telemetry/
      telemetry.service.ts
      telemetry.aggregator.ts
    anomalies/
      anomalies.service.ts
    notifications/
      notifications.service.ts
  jobs/
    scheduler.ts
    shellyPolling.job.ts
    hourlyAgg.job.ts
    dailyAgg.job.ts
    baseline.job.ts
    anomaly.job.ts
```

---

## 4. Descripción de módulos

### 4.1 auth

**Responsabilidades principales:**

- Registro e inicio de sesión de usuarios de Energy Sentinel AI.
- Emisión y validación de JWT propios del sistema.
- Middleware `requireAuth` para proteger rutas.

**Criterio de “listo”:**

- Se puede crear usuario, iniciar sesión y acceder a una ruta protegida.

### 4.2 homes

**Responsabilidades principales:**

- CRUD de Homes (incluye timezone).
- Validación de ownership: un usuario solo consulta/modifica sus Homes.

**Criterio de “listo”:**

- Crear y listar Homes por usuario.

### 4.3 devices

**Responsabilidades principales:**

- CRUD de dispositivos (inventario).
- Listado por Home (`GET /homes/:homeId/devices`).
- Soporte de importación desde Shelly (invocado por el módulo `shelly`).

**Criterio de “listo”:**

- Crear/listar devices por Home y obtener detalle por device.

### 4.4 shelly (OAuth + cliente)

**Responsabilidades principales:**

- Endpoints de integración OAuth: `start`, `callback`, `reconnect`, `sync`.
- Gestión de tokens y `user_api_url` por Home.
- Cliente HTTP encapsulado (`shelly.client.ts`) y mapeo de payloads (`shelly.mapper.ts`).
- Función central `getValidAccessToken(homeId)` para reemitir/renovar access tokens.

**Criterio de “listo”:**

- Conectar Shelly, obtener `all_status` y “importar” devices al Home.

### 4.5 telemetry

**Responsabilidades principales:**

- Inserción de lecturas crudas (`device_readings`).
- Cálculo de `energy_delta_wh` comparando el contador total (`energy_wh`) contra la lectura previa.
- Servicios de consulta (latest reading) y apoyo a jobs de agregación.

**Criterio de “listo”:**

- Guardar lecturas y consultar la última lectura por dispositivo.

### 4.6 jobs

**Responsabilidades principales:**

- Job de polling (cada 60s): por integración activa, valida token, consulta `/device/all_status`, inserta lecturas.
- Jobs de agregación (hourly/daily): `UPSERT` por índices únicos.
- Jobs de baseline/anomalías (fase 2).

**Criterio de “listo”:**

- El sistema se alimenta solo y produce históricos agregados.

### 4.7 anomalies + notifications (fase 2)

**Responsabilidades principales:**

- Entrenar/actualizar baselines por dispositivo (`device_baselines`).
- Detectar anomalías (`anomaly_events`) comparando observado vs esperado.
- Enviar notificaciones push y registrar en `notification_logs`.

**Criterio de “listo”:**

- Generar al menos una alerta y registrar el envío push.

---

## 5. Orden recomendado de implementación

1. **Base de datos + Prisma schema + migración inicial.**
2. **Módulo auth** (`register/login + JWT`).
3. **Módulo homes** (CRUD).
4. **Módulo shelly:** callback (guardar integración + `auth_code`).
5. **Módulo shelly:** sync (importar devices).
6. **Módulo telemetry:** inserción de readings + endpoint latest.
7. **Job polling** (cada 60s).
8. **Jobs de agregación** hourly/daily.
9. **Fase 2:** baselines, anomalías y push notifications.

---
