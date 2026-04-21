# Energy Sentinel AI Backend

## Documento unificado de arquitectura, estructura modular, endpoints y modelo de datos

Este documento reemplaza la documentación previa dispersa y describe el estado actual real del backend en `backend/`.

## 1. Objetivo del backend

El backend de Energy Sentinel AI es una API en Node.js + Express + TypeScript con Prisma y PostgreSQL. Su responsabilidad es:

- autenticar usuarios propios de Energy Sentinel AI
- gestionar Homes y Devices con ownership por usuario
- integrar OAuth con Shelly Cloud
- descubrir e importar dispositivos Shelly al inventario local
- mantener credenciales Shelly en servidor
- consultar la API de Shelly desde el backend
- ejecutar un polling periódico para ingerir `device_readings`

Regla importante:

- el backend nunca expone `access_token` de Shelly al cliente

## 2. Stack actual

- Runtime: Node.js
- Framework HTTP: Express 5
- Lenguaje: TypeScript
- ORM: Prisma
- Base de datos: PostgreSQL
- Validación: Zod
- Auth propia: JWT access token + JWT refresh token
- Integración externa actual: Shelly Cloud OAuth

## 3. Arquitectura general

La aplicación sigue una estructura modular por dominio y una separación por capas:

- `routes`: definen endpoints y middleware HTTP
- `controller`: traduce request/response HTTP
- `service`: implementa lógica de negocio
- `shared/client/parser/repository`: encapsulan utilidades, acceso a Shelly y acceso repetido a Prisma
- `common`: middleware transversal de auth, ownership y validación

Flujo típico de una request protegida:

1. `requireAuth` valida el bearer token del backend
2. `requireAuthContext` deja `req.authUserId`
3. `validateRequest` valida `body`, `params` o `query`
4. middleware de ownership resuelve `req.ownedHome` o `req.ownedDevice` si aplica
5. controller extrae contexto y llama service
6. service ejecuta lógica de dominio y persiste con Prisma

## 4. Estructura real de carpetas

```txt
backend/src/
  app/
    app.ts
  common/
    auth/
      auth-context.ts
      requireAuth.ts
    ownership/
      device-ownership.ts
      home-ownership.ts
    validation/
      validate.ts
  config/
    env.ts
  scripts/
    ml-score-reading.ts
    ml-train-device.ts
  jobs/
    job-aggregates.ts
    job-shelly-polling.ts
  lib/
    job-lock.ts
    prisma.ts
  modules/
    auth/
      auth.controller.ts
      auth.routes.ts
      auth.schemas.ts
      auth.service.ts
      jwt.ts
      password.ts
    homes/
      homes.controller.ts
      homes.routes.ts
      homes.schemas.ts
      homes.service.ts
    devices/
      devices.controller.ts
      devices.routes.ts
      devices.schemas.ts
      devices.service.ts
    consumption/
      consumption.controller.ts
      consumption.repository.ts
      consumption.routes.ts
      consumption.schemas.ts
      consumption.service.ts
    aggregates/
      aggregates.service.ts
      usage-aggregation.repository.ts
      usage-aggregation.service.ts
      usage-aggregation.types.ts
    anomaly-detection/
      anomaly-detection.constants.ts
      anomaly-detection.repository.ts
      anomaly-detection.service.ts
      anomaly-detection.types.ts
      feature-engineering.ts
      ml-service.client.ts
    shelly/
      shelly.controller.ts
      shelly.routes.ts
      shelly.schemas.ts
      shelly.service.ts
      shelly.templates.ts
      oauth/
        shelly-oauth.service.ts
      discovery/
        shelly-discovery.service.ts
      polling/
        shelly-polling.service.ts
        shelly-readings.ingestion.ts
      shared/
        shelly-all-status.ts
        shelly-api-client.ts
        shelly-integration.repository.ts
        shelly-jwt.ts
        shelly-parsers.ts
        shelly.constants.ts
        shelly.types.ts
  server.dev.ts
  server.ts
```

Servicio interno adicional:

```text
ml-service/
  app/
    main.py
  Dockerfile
  .env.example
  .gitignore
  requirements.txt
```

## 5. Diseño de módulos

### 5.1 `auth`

Responsabilidades:

- registro de usuario
- login
- refresh de sesión
- logout
- endpoint `me`
- emisión y validación de JWT del backend
- persistencia de refresh tokens hasheados en DB

Decisiones actuales:

- en cada login se revocan refresh tokens previos del usuario
- refresh token rotation: al usar un refresh válido, ese refresh se revoca y se emite uno nuevo
- `requireAuth` solo valida access token del backend

### 5.2 `homes`

Responsabilidades:

- crear Home
- listar Homes del usuario autenticado
- obtener Home por id
- actualizar Home
- borrar Home

Autorización:

- toda operación de lectura/escritura sobre un Home pasa por ownership con `requireOwnedHomeParam`

### 5.3 `devices`

Responsabilidades:

- crear device manualmente dentro de un Home
- listar devices por Home
- obtener detalle de device
- actualizar device
- borrar device

Autorización:

- creación/listado por Home usa `requireOwnedHomeParam`
- detalle/update/delete usa `requireOwnedDeviceParam`

Regla importante:

- la unicidad actual del inventario es `@@unique([userId, externalDeviceId])`

### 5.4 `shelly`

El módulo Shelly ya no es un service monolítico. Está dividido en 4 responsabilidades:

- `oauth/`: flujo OAuth, token exchange, refresh, estado de integración
- `discovery/`: discover e import de devices
- `polling/`: scheduler y corrida por lotes
- `shared/`: cliente HTTP, parsers, tipos, constantes y helpers de integración

#### `shelly/oauth`

Responsabilidades:

- iniciar OAuth generando `state`
- recibir callback público con `code` + `state`
- validar `state`
- persistir `auth_code`
- intercambiar `auth_code` por `access_token`
- actualizar `user_api_url`
- devolver token válido bajo demanda
- eliminar integración Shelly del usuario
- informar estado de integración

Decisiones actuales:

- relación `User -> ShellyIntegration` es 1:1
- `auth_code` se persiste
- `access_token` se persiste
- el `user_api_url` vigente se actualiza desde el `access_token` más reciente
- si falla un token exchange, la integración pasa a `status = "error"`

#### `shelly/discovery`

Responsabilidades:

- llamar a Shelly `all_status`
- normalizar payload
- clasificar devices en:
  - nuevos
  - ya conocidos
  - inválidos
- importar devices seleccionados a un Home del usuario

Reglas actuales:

- discover no escribe en la tabla `devices`
- import solo crea filas nuevas
- si un `externalDeviceId` ya existe en DB para ese usuario, se marca `ALREADY_IMPORTED`
- si viene duplicado en la misma request, se marca `DUPLICATED_IN_REQUEST`
- si no aparece en Shelly, se marca `NOT_FOUND_IN_SHELLY`

#### `shelly/polling`

Responsabilidades:

- exponer una corrida one-shot reusable
- soportar scheduler in-process para desarrollo local
- paginar integraciones activas
- procesar varias integraciones con límite de concurrencia
- ingerir lecturas por device desde `switch:0`

Reglas actuales:

- en producción se ejecuta como job batch separado del servidor HTTP
- en desarrollo local puede correr con scheduler in-process
- el scheduler local evita corridas superpuestas con un guard en memoria

#### `jobs`

Responsabilidades:

- ejecutar polling Shelly una sola vez por proceso
- ejecutar aggregates una sola vez por proceso
- ejecutar scoring de anomalías dentro de polling
- ejecutar entrenamiento de modelos dentro de aggregates
- cerrar Prisma al terminar
- proteger corridas con lock distribuido en DB

Reglas actuales:

- `job-shelly-polling.ts` corre `runShellyReadingsPollingOnce()`
- `job-aggregates.ts` corre `runDeviceUsageAggregationOnce()`
- el scoring de anomalías corre dentro de polling después de insertar cada lectura nueva
- el entrenamiento del modelo corre dentro de `runDeviceUsageAggregationOnce()`, no como tercer job separado
- ambos jobs intentan tomar lock en `job_locks`
- si el lock ya está tomado, el proceso sale como `skipped`

#### `shelly/shared`

Responsabilidades:

- construir URLs Shelly correctas por `user_api_url`
- hacer requests HTTP a Shelly
- decodificar JWT Shelly sin verificar firma
- normalizar payloads discovery y readings
- encapsular helpers repetidos de Prisma sobre la integración Shelly

### 5.5 `consumption`

Responsabilidades:

- exponer series temporales consumibles por frontend
- devolver consumo por device
- devolver consumo total por home
- devolver vistas agregadas listas para pantallas del frontend
- resolver granularidad automática por rango
- reutilizar `device_readings`, `device_usage_hourly` y `device_usage_daily` sin exponer tablas internas

Reglas actuales:

- `GET /devices/:deviceId/consumption` usa ownership por device
- `GET /homes/:homeId/consumption` usa ownership por home
- `GET /homes/:homeId/consumption/summary` usa ownership por home
- para `devices`, `granularity=auto` resuelve:
  - `raw` para ventanas `<= 6h`
  - `hourly` para ventanas `> 6h` y `<= 14d`
  - `daily` para ventanas `> 14d`
- para `homes`, `granularity=auto` resuelve:
  - `hourly` para ventanas `<= 14d`
  - `daily` para ventanas `> 14d`
- `granularity=raw` solo se acepta para `devices` con ventanas `<= 24h`
- `granularity=raw` no se acepta para `homes`
- el summary por home usa periodos semánticos `today | week | month`
- el summary por home calcula rango actual, rango anterior, tendencia, promedio y breakdown por device en backend
- el rango máximo expuesto en v1 es `90d`
- la respuesta siempre devuelve un `series[]` homogéneo con:
  - `ts`
  - `energyWh`
  - `avgPowerW`
  - `maxPowerW`
  - `minPowerW`
  - `samplesCount`
- el total por home suma todos los devices del home por bucket temporal

### 5.6 `aggregates`

Responsabilidades:

- exponer una corrida one-shot reusable
- soportar scheduler in-process para desarrollo local
- recorrer devices que ya tienen `device_readings`
- materializar `device_usage_hourly`
- materializar `device_usage_daily`
- entrenar/reentrenar modelos de anomalías cuando ya existe un nuevo día local cerrado
- calcular agregados diarios usando `home.timezone`

Reglas actuales:

- en producción se ejecuta como job batch separado del servidor HTTP
- en desarrollo local puede correr al boot y luego por `setInterval`
- solo materializa buckets cerrados
- `hourly` se calcula por hora UTC cerrada
- `daily` se calcula por día local cerrado del `home.timezone`
- `daily` se calcula directo desde `device_readings`, no desde `hourly`
- el entrenamiento ML usa `device_usage_daily` para elegibilidad y `device_readings` para feature engineering
- el modelo v1 es `IsolationForest`, uno por device
- el modelo v1 usa ventana de 30 días locales cerrados contiguos
- si no existe modelo activo, las lecturas se ingieren igual y la predicción queda como `model_not_ready`
- si falla un device, la corrida sigue con los demás

### 5.7 `anomaly-detection`

Responsabilidades:

- exponer snapshot actual por device para frontend móvil
- exponer incidentes de anomalías por device
- persistir predicciones por lectura y eventos agrupados por racha

Reglas actuales:

- `GET /devices/:deviceId/state` usa ownership por device
- `GET /devices/:deviceId/anomalies` usa ownership por device
- `device_anomaly_predictions` sigue siendo 1 fila por lectura scoreada
- `anomaly_events` representa incidentes agrupados por racha
- una lectura anómala dentro de `5m` del `windowEnd` extiende el incidente abierto del device
- una lectura normal posterior cierra el incidente abierto
- si una nueva anomalía rompe el gap de `5m`, el incidente anterior se cierra y se abre otro

## 6. App entrypoint y middleware global

En `backend/src/app/app.ts` se monta:

- `helmet()`
- `cors()`
- `express.json({ limit: "1mb" })`
- `morgan("dev")`

Routers montados:

- `GET /health`
- `/auth`
- `/integrations/shelly`
- `/homes`
- `/` para `anomaly-detection`
- `/` para `consumption`
- `/` para `devices`

## 7. Endpoints actuales

### 7.1 Salud

#### `GET /health`

Propósito:

- comprobar que la API está viva

Auth:

- no requiere autenticación

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "ok": true,
  "service": "Energy Sentinel AI API"
}
```

### 7.2 Auth

#### `POST /auth/register`

Propósito:

- crear usuario
- emitir access token y refresh token

Auth:

- no requiere autenticación

Payload:

```json
{
  "email": "diego@example.com",
  "password": "Password123!",
  "name": "Diego"
}
```

Ejemplo de respuesta:

```json
{
  "user": {
    "id": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "email": "diego@example.com",
    "name": "Diego",
    "createdAt": "2026-03-06T05:30:00.000Z"
  },
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<jwt_refresh_token>"
}
```

#### `POST /auth/login`

Propósito:

- autenticar usuario existente
- revocar refresh tokens anteriores
- emitir nuevo par de tokens

Auth:

- no requiere autenticación

Payload:

```json
{
  "email": "diego@example.com",
  "password": "Password123!"
}
```

Ejemplo de respuesta:

```json
{
  "user": {
    "id": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "email": "diego@example.com",
    "name": "Diego",
    "createdAt": "2026-03-06T05:30:00.000Z"
  },
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<jwt_refresh_token>"
}
```

#### `POST /auth/refresh`

Propósito:

- intercambiar refresh token válido por un nuevo par de tokens

Auth:

- no requiere access token

Payload:

```json
{
  "refreshToken": "<jwt_refresh_token>"
}
```

Ejemplo de respuesta:

```json
{
  "accessToken": "<new_jwt_access_token>",
  "refreshToken": "<new_jwt_refresh_token>"
}
```

#### `POST /auth/logout`

Propósito:

- revocar refresh token actual

Auth:

- no requiere access token

Payload:

```json
{
  "refreshToken": "<jwt_refresh_token>"
}
```

Ejemplo de respuesta:

- `204 No Content`

#### `GET /auth/me`

Propósito:

- devolver identidad del usuario autenticado

Auth:

- requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "user": {
    "sub": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "email": "diego@example.com",
    "iat": 1772688600,
    "exp": 1772692200
  }
}
```

### 7.3 Homes

#### `POST /homes`

Propósito:

- crear un Home del usuario autenticado

Auth:

- sí requiere access token del backend

Payload:

```json
{
  "name": "Casa",
  "timezone": "America/Mexico_City"
}
```

Ejemplo de respuesta:

```json
{
  "home": {
    "id": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "name": "Casa",
    "timezone": "America/Mexico_City",
    "createdAt": "2026-03-06T05:40:00.000Z",
    "updatedAt": "2026-03-06T05:40:00.000Z"
  }
}
```

#### `GET /homes`

Propósito:

- listar Homes del usuario autenticado

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "homes": [
    {
      "id": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
      "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
      "name": "Casa",
      "timezone": "America/Mexico_City",
      "createdAt": "2026-03-06T05:40:00.000Z",
      "updatedAt": "2026-03-06T05:40:00.000Z"
    }
  ]
}
```

#### `GET /homes/:id`

Propósito:

- obtener un Home específico del usuario

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "home": {
    "id": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "name": "Casa",
    "timezone": "America/Mexico_City",
    "createdAt": "2026-03-06T05:40:00.000Z",
    "updatedAt": "2026-03-06T05:40:00.000Z"
  }
}
```

Protección adicional:

- ownership por `requireOwnedHomeParam("id")`

#### `PATCH /homes/:id`

Propósito:

- actualizar nombre o timezone del Home

Auth:

- sí requiere access token del backend

Payload:

```json
{
  "name": "Casa Principal"
}
```

Ejemplo de respuesta:

```json
{
  "home": {
    "id": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "name": "Casa Principal",
    "timezone": "America/Mexico_City",
    "createdAt": "2026-03-06T05:40:00.000Z",
    "updatedAt": "2026-03-06T05:42:00.000Z"
  }
}
```

Protección adicional:

- ownership por `requireOwnedHomeParam("id")`

#### `DELETE /homes/:id`

Propósito:

- borrar un Home propio

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "ok": true
}
```

Protección adicional:

- ownership por `requireOwnedHomeParam("id")`

### 7.4 Devices

### 7.4 Consumo

#### `GET /devices/:deviceId/consumption`

Propósito:

- devolver serie temporal de consumo para un device

Auth:

- requiere access token del backend
- requiere ownership del device

Query params:

- `from`: ISO datetime
- `to`: ISO datetime
- `granularity`: `auto | raw | hourly | daily` opcional, default `auto`
- en `homes`, `raw` devuelve `400 INVALID_GRANULARITY_FOR_RANGE` y `auto` resuelve mínimo a `hourly`
- `raw` no se acepta para homes; en homes `auto` resuelve mínimo a `hourly`

Ejemplo:

```http
GET /devices/6def05af-9021-49fc-babe-d6972e668766/consumption?from=2026-03-25T00:00:00.000Z&to=2026-03-25T05:59:59.999Z
```

Ejemplo de respuesta:

```json
{
  "device": {
    "id": "6def05af-9021-49fc-babe-d6972e668766",
    "homeId": "c64532b2-7c53-4f6f-bc92-9ec77fc6639b",
    "userId": "ab5d7cbb-6c5b-4c2f-8dc0-49da2f4e4f37",
    "vendor": "shelly",
    "deviceCode": null,
    "displayName": "device-raw",
    "ipAddress": null,
    "macAddress": null,
    "externalDeviceId": "ext-raw-1",
    "status": "active",
    "lastSeenAt": null,
    "dataSource": "shelly_cloud",
    "createdAt": "2026-03-25T00:00:00.000Z",
    "updatedAt": "2026-03-25T00:00:00.000Z"
  },
  "range": {
    "from": "2026-03-25T00:00:00.000Z",
    "to": "2026-03-25T05:59:59.999Z"
  },
  "granularityRequested": "auto",
  "granularityResolved": "raw",
  "timezone": "Etc/UTC",
  "series": [
    {
      "ts": "2026-03-25T00:10:00.000Z",
      "energyWh": 1.5,
      "avgPowerW": 50,
      "maxPowerW": 50,
      "minPowerW": 50,
      "samplesCount": 1
    }
  ]
}
```

#### `GET /homes/:homeId/consumption`

Propósito:

- devolver serie temporal de consumo total del home sumando todos sus devices

Auth:

- requiere access token del backend
- requiere ownership del home

Query params:

- `from`: ISO datetime
- `to`: ISO datetime
- `granularity`: `auto | raw | hourly | daily` opcional, default `auto`
- en `homes`, `raw` devuelve `400 INVALID_GRANULARITY_FOR_RANGE` y `auto` resuelve mínimo a `hourly`

Ejemplo:

```http
GET /homes/93840b75-9632-49d4-8f39-b892620eef73/consumption?from=2026-03-24T00:00:00.000Z&to=2026-03-25T00:00:00.000Z&granularity=hourly
```

Ejemplo de respuesta:

```json
{
  "home": {
    "id": "93840b75-9632-49d4-8f39-b892620eef73",
    "userId": "ab5d7cbb-6c5b-4c2f-8dc0-49da2f4e4f37",
    "name": "my-home",
    "timezone": "Etc/UTC",
    "createdAt": "2026-03-25T00:00:00.000Z",
    "updatedAt": "2026-03-25T00:00:00.000Z"
  },
  "range": {
    "from": "2026-03-24T00:00:00.000Z",
    "to": "2026-03-25T00:00:00.000Z"
  },
  "granularityRequested": "hourly",
  "granularityResolved": "hourly",
  "timezone": "Etc/UTC",
  "series": [
    {
      "ts": "2026-03-24T00:00:00.000Z",
      "energyWh": 30,
      "avgPowerW": 66.66666666666667,
      "maxPowerW": 120,
      "minPowerW": 40,
      "samplesCount": 3
    }
  ]
}
```

Errores relevantes v1:

- `400 INVALID_QUERY`
- `400 INVALID_RANGE`
- `400 INVALID_GRANULARITY_FOR_RANGE`
- `404 HOME_NOT_FOUND`
- `404 HOME_NOT_FOUND`

#### `GET /homes/:homeId/consumption/summary`

Propósito:

- devolver un resumen agregado listo para la pantalla de consumo del home
- incluir serie temporal del periodo actual, comparación contra el periodo anterior y breakdown por device

Auth:

- requiere access token del backend
- requiere ownership del home

Query params:

- `period`: `today | week | month`, opcional, default `week`

Semántica de periodos:

- `today`: desde medianoche local del home hasta ahora
- `week`: desde lunes local 00:00 hasta ahora
- `month`: desde el día 1 local 00:00 hasta ahora
- `previous`: siempre se calcula como el intervalo inmediatamente anterior de la misma duración

Granularidad resuelta:

- `today` -> `hourly`
- `week` -> `hourly`
- `month` -> `daily`

Ejemplo:

```http
GET /homes/93840b75-9632-49d4-8f39-b892620eef73/consumption/summary?period=week
```

Ejemplo de respuesta:

```json
{
  "home": {
    "id": "93840b75-9632-49d4-8f39-b892620eef73",
    "userId": "ab5d7cbb-6c5b-4c2f-8dc0-49da2f4e4f37",
    "name": "my-home",
    "timezone": "Etc/UTC",
    "createdAt": "2026-03-25T00:00:00.000Z",
    "updatedAt": "2026-03-25T00:00:00.000Z"
  },
  "generatedAt": "2026-04-21T18:00:00.000Z",
  "timezone": "Etc/UTC",
  "period": "week",
  "range": {
    "current": {
      "from": "2026-04-21T00:00:00.000Z",
      "to": "2026-04-21T18:00:00.000Z"
    },
    "previous": {
      "from": "2026-04-20T06:00:00.000Z",
      "to": "2026-04-21T00:00:00.000Z"
    }
  },
  "chart": {
    "granularityResolved": "hourly",
    "series": [
      {
        "ts": "2026-04-21T10:00:00.000Z",
        "energyWh": 30,
        "avgPowerW": 66.66666666666667,
        "maxPowerW": 120,
        "minPowerW": 40,
        "samplesCount": 3
      }
    ]
  },
  "summary": {
    "totalEnergyWh": 95,
    "previousTotalEnergyWh": 80,
    "trend": "up",
    "trendPercent": 19,
    "averageEnergyWh": 14,
    "averageUnit": "day"
  },
  "breakdown": {
    "deviceCount": 3,
    "items": [
      {
        "deviceId": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
        "name": "Cafetera",
        "energyWh": 40,
        "percentage": 42
      }
    ]
  }
}
```

Errores relevantes v1:

- `400 INVALID_QUERY`
- `404 HOME_NOT_FOUND`

### 7.5 Devices

#### `POST /homes/:homeId/devices`

Propósito:

- crear un device manualmente dentro de un Home propio

Auth:

- sí requiere access token del backend

Payload:

```json
{
  "vendor": "shelly",
  "displayName": "Cafetera",
  "externalDeviceId": "58e6c50a5b38",
  "deviceCode": "S4PL-00116US",
  "ipAddress": "192.168.2.18",
  "macAddress": "58E6C50A5B38",
  "status": "active",
  "dataSource": "shelly_cloud"
}
```

Ejemplo de respuesta:

```json
{
  "device": {
    "id": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
    "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "vendor": "shelly",
    "deviceCode": "S4PL-00116US",
    "displayName": "Cafetera",
    "ipAddress": "192.168.2.18",
    "macAddress": "58E6C50A5B38",
    "externalDeviceId": "58e6c50a5b38",
    "status": "active",
    "lastSeenAt": null,
    "dataSource": "shelly_cloud",
    "createdAt": "2026-03-06T05:50:00.000Z",
    "updatedAt": "2026-03-06T05:50:00.000Z"
  }
}
```

Protección adicional:

- ownership del Home por `requireOwnedHomeParam("homeId")`

#### `GET /homes/:homeId/devices`

Propósito:

- listar devices de un Home propio

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "devices": [
    {
      "id": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
      "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
      "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
      "vendor": "shelly",
      "deviceCode": "S4PL-00116US",
      "displayName": "Cafetera",
      "ipAddress": "192.168.2.18",
      "macAddress": "58E6C50A5B38",
      "externalDeviceId": "58e6c50a5b38",
      "status": "active",
      "lastSeenAt": null,
      "dataSource": "shelly_cloud",
      "createdAt": "2026-03-06T05:50:00.000Z",
      "updatedAt": "2026-03-06T05:50:00.000Z"
    }
  ]
}
```

Protección adicional:

- ownership del Home por `requireOwnedHomeParam("homeId")`

#### `GET /devices/:deviceId`

Propósito:

- obtener detalle de un device propio

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "device": {
    "id": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
    "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "vendor": "shelly",
    "deviceCode": "S4PL-00116US",
    "displayName": "Cafetera",
    "ipAddress": "192.168.2.18",
    "macAddress": "58E6C50A5B38",
    "externalDeviceId": "58e6c50a5b38",
    "status": "active",
    "lastSeenAt": null,
    "dataSource": "shelly_cloud",
    "createdAt": "2026-03-06T05:50:00.000Z",
    "updatedAt": "2026-03-06T05:50:00.000Z"
  }
}
```

Protección adicional:

- ownership del device por `requireOwnedDeviceParam("deviceId")`

#### `PATCH /devices/:deviceId`

Propósito:

- actualizar metadata del device
- permite mover device entre Homes del mismo usuario

Auth:

- sí requiere access token del backend

Payload:

```json
{
  "displayName": "Cafetera Cocina",
  "status": "active"
}
```

Ejemplo de respuesta:

```json
{
  "device": {
    "id": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
    "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "vendor": "shelly",
    "deviceCode": "S4PL-00116US",
    "displayName": "Cafetera Cocina",
    "ipAddress": "192.168.2.18",
    "macAddress": "58E6C50A5B38",
    "externalDeviceId": "58e6c50a5b38",
    "status": "active",
    "lastSeenAt": null,
    "dataSource": "shelly_cloud",
    "createdAt": "2026-03-06T05:50:00.000Z",
    "updatedAt": "2026-03-06T05:55:00.000Z"
  }
}
```

Protección adicional:

- ownership del device por `requireOwnedDeviceParam("deviceId")`

#### `DELETE /devices/:deviceId`

Propósito:

- borrar un device propio

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

- `204 No Content`

Protección adicional:

- ownership del device por `requireOwnedDeviceParam("deviceId")`

### 7.6 Anomalías

#### `GET /devices/:deviceId/state`

Propósito:

- devolver snapshot actual del device
- incluir última lectura, estado del modelo y posible incidente abierto

Auth:

- sí requiere access token del backend
- requiere ownership del device

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "device": {
    "id": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
    "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "vendor": "shelly",
    "deviceCode": "S4PL-00116US",
    "displayName": "Cafetera",
    "ipAddress": "192.168.2.18",
    "macAddress": "58E6C50A5B38",
    "externalDeviceId": "58e6c50a5b38",
    "status": "active",
    "lastSeenAt": null,
    "dataSource": "shelly_cloud",
    "createdAt": "2026-03-06T05:50:00.000Z",
    "updatedAt": "2026-03-06T05:50:00.000Z"
  },
  "latestReading": {
    "ts": "2026-03-24T18:00:00.000Z",
    "apower": 61,
    "aenergyDelta": 2,
    "voltage": 121,
    "current": 0.5,
    "output": true
  },
  "model": {
    "ready": true,
    "status": "active",
    "trainedAt": "2026-03-03T10:00:00.000Z",
    "trainedTo": "2026-03-02"
  },
  "activeAnomaly": {
    "id": "b7c99fe2-4048-47f0-84ef-4bc9fd3f1f7d",
    "status": "open",
    "detectedAt": "2026-03-24T18:00:00.000Z",
    "windowStart": "2026-03-24T18:00:00.000Z",
    "windowEnd": "2026-03-24T18:03:00.000Z",
    "readingsCount": 2,
    "severity": 1,
    "score": -0.9,
    "expectedValue": 50,
    "observedValue": 61,
    "details": {
      "dayGroup": "weekday",
      "localHour": 18
    }
  }
}
```

#### `GET /devices/:deviceId/anomalies`

Propósito:

- devolver incidentes de anomalías agrupados por device

Auth:

- sí requiere access token del backend
- requiere ownership del device

Query params:

- `from`: ISO datetime opcional
- `to`: ISO datetime opcional
- `status`: `all | open | closed`, opcional, default `all`
- `limit`: entero positivo, opcional, default `20`, max `100`

Ejemplo de respuesta:

```json
{
  "device": {
    "id": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
    "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
    "vendor": "shelly",
    "deviceCode": "S4PL-00116US",
    "displayName": "Cafetera",
    "ipAddress": "192.168.2.18",
    "macAddress": "58E6C50A5B38",
    "externalDeviceId": "58e6c50a5b38",
    "status": "active",
    "lastSeenAt": null,
    "dataSource": "shelly_cloud",
    "createdAt": "2026-03-06T05:50:00.000Z",
    "updatedAt": "2026-03-06T05:50:00.000Z"
  },
  "filters": {
    "from": null,
    "to": null,
    "status": "all",
    "limit": 20
  },
  "anomalies": [
    {
      "id": "b7c99fe2-4048-47f0-84ef-4bc9fd3f1f7d",
      "status": "closed",
      "detectedAt": "2026-03-24T17:00:00.000Z",
      "windowStart": "2026-03-24T17:00:00.000Z",
      "windowEnd": "2026-03-24T17:04:00.000Z",
      "readingsCount": 2,
      "severity": 1,
      "score": -0.7,
      "expectedValue": null,
      "observedValue": null,
      "details": null
    }
  ]
}
```

Errores relevantes v1:

- `400 INVALID_QUERY`
- `400 INVALID_RANGE`
- `404 DEVICE_NOT_FOUND`

### 7.7 Integración Shelly

#### `GET /integrations/shelly`

Propósito:

- consultar estado actual de la integración Shelly del usuario

Incluye:

- si está conectada
- `status`
- `userApiUrl`
- expiración del access token
- si el token sigue válido
- si necesita refresh
- `lastSyncAt`

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "integration": {
    "connected": true,
    "status": "active",
    "userApiUrl": "https://shelly-243-eu.shelly.cloud",
    "accessTokenExpiresAt": "2026-03-07T05:00:00.000Z",
    "isAccessTokenValid": true,
    "needsRefresh": false,
    "lastSyncAt": "2026-03-06T05:58:00.000Z"
  }
}
```

#### `POST /integrations/shelly`

Propósito:

- iniciar flujo OAuth de Shelly
- crea un `state` persistido y devuelve `authUrl`

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "authUrl": "https://my.shelly.cloud/oauth_login.html?response_type=code&client_id=shelly-diy&state=<state>&redirect_uri=https%3A%2F%2Ftu-backend%2Fintegrations%2Fshelly%2Fcallback"
}
```

#### `GET /integrations/shelly/callback`

Propósito:

- endpoint público de callback OAuth
- recibe `code` y `state`
- valida `state`
- persiste integración
- hace token exchange inicial
- responde HTML simple para cerrar ventana

Auth:

- no requiere autenticación

Payload:

- no recibe body
- usa query params:

```txt
?code=<shelly_code>&state=<oauth_state>
```

Ejemplo de respuesta exitosa:

- `200 text/html`
- contenido HTML simple con mensaje tipo `Shelly conectado, ya puedes cerrar esta ventana`

#### `POST /integrations/shelly/refresh`

Propósito:

- forzar refresh manual del access token Shelly

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "ok": true,
  "status": "active",
  "accessTokenExpiresAt": "2026-03-07T05:00:00.000Z",
  "userApiUrl": "https://shelly-243-eu.shelly.cloud"
}
```

#### `DELETE /integrations/shelly`

Propósito:

- borrar la integración Shelly del usuario
- limpiar también states OAuth asociados

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

- `204 No Content`

#### `POST /integrations/shelly/devices/discover`

Propósito:

- consultar Shelly Cloud
- normalizar los devices descubiertos
- clasificar cuáles ya están en DB y cuáles aún no

No escribe en:

- `devices`

Auth:

- sí requiere access token del backend

Payload:

- no recibe body

Ejemplo de respuesta:

```json
{
  "discovery": {
    "discoveredAt": "2026-03-06T06:05:00.000Z",
    "counts": {
      "totalShelly": 2,
      "new": 1,
      "alreadyKnown": 1,
      "invalid": 0
    },
    "newDevices": [
      {
        "externalDeviceId": "34987acb1111",
        "deviceCode": "S3SW-001X",
        "macAddress": "34987ACB1111",
        "ipAddress": "192.168.2.50",
        "isOnline": false,
        "suggestedVendor": "shelly",
        "suggestedDisplayName": null
      }
    ],
    "alreadyKnown": [
      {
        "deviceId": "7a9dd8a8-d7be-4f46-bb4c-a8ea0f53cfd1",
        "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
        "externalDeviceId": "58e6c50a5b38",
        "vendor": "shelly",
        "displayName": "Cafetera",
        "status": "active",
        "dataSource": "shelly_cloud"
      }
    ],
    "invalidEntries": []
  }
}
```

#### `POST /integrations/shelly/homes/:homeId/devices/import`

Propósito:

- importar devices Shelly seleccionados a un Home propio

Reglas:

- solo crea filas nuevas
- no duplica devices ya existentes
- usa `externalDeviceId` como referencia contra Shelly y contra la DB

Auth:

- sí requiere access token del backend

Payload:

```json
{
  "devices": [
    {
      "externalDeviceId": "34987acb1111",
      "displayName": "Lampara Sala",
      "vendor": "shelly"
    }
  ]
}
```

Ejemplo de respuesta:

```json
{
  "import": {
    "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
    "summary": {
      "requested": 1,
      "created": 1,
      "skipped": 0,
      "errors": 0
    },
    "created": [
      {
        "id": "2d0f1f48-98f2-4dd5-a5a1-51f53f9ecf67",
        "homeId": "4becefa6-f3ef-4fd0-9714-f2dd3e437251",
        "userId": "2c3d44b0-8e16-4e1f-9dc4-5330633a5f63",
        "vendor": "shelly",
        "deviceCode": "S3SW-001X",
        "displayName": "Lampara Sala",
        "ipAddress": "192.168.2.50",
        "macAddress": "34987ACB1111",
        "externalDeviceId": "34987acb1111",
        "status": "disabled",
        "lastSeenAt": null,
        "dataSource": "shelly_cloud",
        "createdAt": "2026-03-06T06:10:00.000Z",
        "updatedAt": "2026-03-06T06:10:00.000Z"
      }
    ],
    "skipped": [],
    "errors": []
  }
}
```

## 8. Flujo de autenticación del backend

### 8.1 Access token

- se envía en `Authorization: Bearer <token>`
- lo valida `requireAuth`
- si es válido, deja `req.user`

### 8.2 Auth context

- `requireAuthContext` copia `req.user.sub` a `req.authUserId`
- el resto del backend trabaja sobre `req.authUserId`

### 8.3 Refresh token

- se persiste en tabla `refresh_tokens` en forma hasheada
- en `refresh`, se verifica firma JWT y luego se busca hash válido en DB
- si existe, se revoca y se emite un par nuevo

## 9. Flujo de ownership y autorización

El backend aplica autorización por contexto de recurso, no solo por token.

### 9.1 Home ownership

- `requireOwnedHomeParam` busca el Home con `where: { id: homeId, userId }`
- si existe, guarda `req.ownedHome`
- si no, responde `404 HOME_NOT_FOUND`

### 9.2 Device ownership

- `requireOwnedDeviceParam` busca el device con `where: { id: deviceId, userId }`
- si existe, guarda `req.ownedDevice`
- si no, responde `404 DEVICE_NOT_FOUND`

Consecuencia:

- los controllers y services reciben IDs ya validados por ownership cuando entran por esos endpoints

## 10. Flujo Shelly OAuth actual

Resumen:

1. `POST /integrations/shelly`
2. backend crea `state` y construye `authUrl`
3. usuario inicia sesión en Shelly
4. Shelly redirige a `GET /integrations/shelly/callback?code=...&state=...`
5. backend valida `state`
6. backend persiste `auth_code`
7. backend decodifica JWT para extraer `user_api_url`
8. backend hace `POST https://<user_api_url>/oauth/auth`
9. backend recibe `access_token`
10. backend decodifica ese token para obtener expiración y `user_api_url` vigente
11. backend guarda `access_token`, expiración y estado de integración

Decisiones:

- el backend usa siempre `user_api_url` persistido
- el refresh usa `auth_code`
- el `access_token` nunca sale al cliente

## 11. Flujo de discover e import Shelly

### 11.1 Discover

Resumen:

1. backend obtiene token válido Shelly
2. llama `GET /device/all_status?show_info=true&no_shared=true`
3. normaliza payload heterogéneo de Shelly
4. extrae `externalDeviceId`, `deviceCode`, `macAddress`, `ipAddress`, `isOnline`
5. compara contra `devices` del usuario
6. responde `newDevices`, `alreadyKnown`, `invalidEntries`

### 11.2 Import

Resumen:

1. backend vuelve a pedir snapshot actual a Shelly
2. construye mapa de devices descubiertos
3. revisa el body del cliente item por item
4. decide:
   - `DUPLICATED_IN_REQUEST`
   - `NOT_FOUND_IN_SHELLY`
   - `ALREADY_IMPORTED`
   - `created`
5. crea nuevos registros en `devices`

Mapeo actual al crear `devices`:

- `externalDeviceId` <- Shelly
- `deviceCode` <- Shelly
- `ipAddress` <- Shelly
- `macAddress` <- Shelly
- `dataSource = "shelly_cloud"`
- `status = "active"` si online, si no `"disabled"`
- `displayName` <- lo manda el cliente
- `vendor` <- lo manda el cliente o default `"shelly"`

## 12. Flujo del polling Shelly

Resumen:

1. en producción, `job-shelly-polling.ts` ejecuta `runShellyReadingsPollingOnce()`
2. en desarrollo local, `server.dev.ts` puede arrancar `startShellyReadingsPolling()`
3. cada corrida pagina integraciones activas
4. para cada integración:
   - obtiene access token válido
   - si hace falta, refresh
   - llama `all_status`
   - extrae `switch:0`
   - busca devices ya importados del usuario por `externalDeviceId`
   - inserta una fila en `device_readings` por device
   - actualiza `lastSyncAt`

Campos de `device_readings` ingeridos hoy:

- `apower`
- `voltage`
- `current`
- `freq`
- `output`
- `aenergyTotal`
- `aenergyDelta`
- `aenergyMinuteTs`
- `aenergyByMinute`
- `retAenergyTotal`
- `retAenergyMinuteTs`
- `retAenergyByMinute`
- `temperatureTc`
- `temperatureTf`
- `source`

Regla de `aenergyDelta`:

- se calcula como `aenergyTotal_actual - aenergyTotal_previo`
- solo si ambos existen y el valor actual no es menor al previo
- si no, se guarda `null`

Protecciones actuales:

- el scheduler local usa guard in-memory para no solapar corridas
- los jobs batch usan `job_locks` para evitar solapes entre procesos

## 13. Variables de entorno relevantes

### Generales

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `CORS_ORIGIN`

### Auth

- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`

### Shelly

- `SHELLY_OAUTH_REDIRECT_URI`
- `SHELLY_POLLING_ENABLED`
- `SHELLY_POLLING_INTERVAL_MS`
- `SHELLY_POLLING_BATCH_SIZE`
- `SHELLY_POLLING_MAX_CONCURRENCY`
- `SHELLY_POLLING_DEBUG_DUMPS`

Comportamiento actual:

- si `SHELLY_POLLING_ENABLED` no existe, el polling queda activo excepto en `NODE_ENV=test`
- `SHELLY_POLLING_INTERVAL_MS` solo importa para el scheduler local

### Aggregates

- `AGGREGATES_ENABLED`
- `AGGREGATES_INTERVAL_MS`
- `AGGREGATES_DEVICE_BATCH_SIZE`

Comportamiento actual:

- el valor recomendado de `AGGREGATES_INTERVAL_MS` es 1 hora para desarrollo local
- en producción la frecuencia la define el scheduler externo del job
- las tablas agregadas no incluyen la hora UTC actual ni el día local actual

### ML / Anomaly Detection

- `ML_ENABLED`
- `ML_SERVICE_BASE_URL`
- `ML_SCORE_TIMEOUT_MS`
- `ML_TRAIN_TIMEOUT_MS`
- `ML_IF_CONTAMINATION`
- `ML_TRAINING_WINDOW_DAYS`

Comportamiento actual:

- si `ML_ENABLED=false`, polling y aggregates omiten scoring y entrenamiento ML
- el scoring corre dentro del polling después de insertar una lectura nueva
- el entrenamiento corre dentro del runner de aggregates
- el valor recomendado de `ML_TRAINING_WINDOW_DAYS` es `30`
- el valor recomendado de `ML_IF_CONTAMINATION` es `0.02`
- si `ML_ENABLED=true`, `ML_SERVICE_BASE_URL` es obligatoria

### ML service local

- `ML_SERVICE_HOST`
- `ML_SERVICE_PORT`
- `ML_SERVICE_LOG_LEVEL`

Comportamiento actual:

- estas variables solo las usa el contenedor/proceso Python del `ml-service`
- no reemplazan `ML_SERVICE_BASE_URL` del backend
- el backend se conecta al `ml-service` por HTTP

## 14. Modelo de datos actual

### Implementado y en uso activo

- `users`
- `refresh_tokens`
- `homes`
- `shelly_integrations`
- `shelly_oauth_states`
- `devices`
- `device_readings`
- `job_locks`

### Ya modelado en Prisma, pero no completamente expuesto por endpoints/jobs aún

- `device_usage_hourly`
- `device_usage_daily`
- `device_anomaly_models`
- `device_reading_features`
- `device_anomaly_predictions`
- `anomaly_events`
- `user_push_tokens`
- `notification_logs`

### Resumen por tabla y relaciones

#### `users`

Propósito:

- identidad principal del usuario del backend

Relaciones:

- `1:N` con `homes`
- `1:N` con `devices`
- `1:N` con `refresh_tokens`
- `1:1` opcional con `shelly_integrations`
- `1:N` con `shelly_oauth_states`
- `1:N` con `user_push_tokens`
- `1:N` con `notification_logs`

Campos clave:

- `id`
- `email` único
- `password_hash`
- `name`
- timestamps de creación y actualización

#### `refresh_tokens`

Propósito:

- persistir refresh tokens del backend de forma hasheada

Relaciones:

- `N:1` hacia `users`

Campos clave:

- `user_id`
- `token_hash` único
- `expires_at`
- `revoked_at`

Notas:

- soporta rotación y revocación de refresh tokens

#### `homes`

Propósito:

- agrupar devices del usuario bajo un contexto doméstico o ubicación

Relaciones:

- `N:1` hacia `users`
- `1:N` con `devices`

Campos clave:

- `user_id`
- `name`
- `timezone`

Notas:

- `timezone` es crítico para agregados diarios y entrenamiento ML por día local

#### `shelly_integrations`

Propósito:

- persistir la conexión del usuario con Shelly Cloud

Relaciones:

- `1:1` con `users` por `user_id` único

Campos clave:

- `client_id`
- `user_api_url`
- `auth_code`
- `access_token`
- `access_token_expires_at`
- `status`
- `last_sync_at`

Notas:

- el `access_token` de Shelly se guarda solo en servidor
- `user_api_url` se usa para consumir la API correcta del tenant Shelly

#### `shelly_oauth_states`

Propósito:

- soportar el flujo OAuth con `state` temporal y consumible una sola vez

Relaciones:

- `N:1` hacia `users`

Campos clave:

- `state` único
- `expires_at`
- `consumed_at`

#### `devices`

Propósito:

- inventario local de devices ya conocidos por el backend

Relaciones:

- `N:1` hacia `users`
- `N:1` hacia `homes`
- `1:N` con `device_readings`
- `1:N` con `device_usage_hourly`
- `1:N` con `device_usage_daily`
- `1:N` con `device_anomaly_models`
- `1:N` con `device_reading_features`
- `1:N` con `device_anomaly_predictions`
- `1:N` con `anomaly_events`

Campos clave:

- `home_id`
- `user_id`
- `vendor`
- `device_code`
- `display_name`
- `ip_address`
- `mac_address`
- `external_device_id`
- `status`
- `last_seen_at`
- `data_source`

Restricciones e índices:

- unicidad por `user_id + external_device_id`
- índices por `home_id` y `user_id`

#### `device_readings`

Propósito:

- guardar la telemetría cruda ingerida desde Shelly para cada device

Relaciones:

- `N:1` hacia `devices`
- `1:N` con `device_reading_features`
- `1:N` con `device_anomaly_predictions`
- `1:N` con `anomaly_events`

Campos clave:

- `device_id`
- `ts`
- `apower`
- `voltage`
- `current`
- `freq`
- `output`
- `aenergy_total`
- `aenergy_delta`
- `aenergy_minute_ts`
- `aenergy_by_minute`
- `ret_aenergy_total`
- `ret_aenergy_minute_ts`
- `ret_aenergy_by_minute`
- `temperature_tc`
- `temperature_tf`
- `source`

Restricciones e índices:

- unicidad por `device_id + ts`
- índice por `device_id, ts`

Notas:

- esta es la fuente de verdad de consumo crudo y snapshot actual por device

#### `device_usage_hourly`

Propósito:

- almacenar agregados horarios cerrados por device

Relaciones:

- `N:1` hacia `devices`

Campos clave:

- `device_id`
- `hour_ts`
- `energy_wh`
- `avg_power_w`
- `max_power_w`
- `min_power_w`
- `samples_count`

Restricciones:

- unicidad por `device_id + hour_ts`

#### `device_usage_daily`

Propósito:

- almacenar agregados diarios cerrados por device usando el día local del home

Relaciones:

- `N:1` hacia `devices`

Campos clave:

- `device_id`
- `date`
- `energy_wh`
- `avg_power_w`
- `max_power_w`
- `min_power_w`
- `samples_count`

Restricciones:

- unicidad por `device_id + date`

#### `device_anomaly_models`

Propósito:

- guardar versiones entrenadas del modelo de anomalías por device

Relaciones:

- `N:1` hacia `devices`
- `1:N` con `device_anomaly_predictions`
- `1:N` con `anomaly_events`

Campos clave:

- `device_id`
- `model_type`
- `model_version`
- `feature_schema_version`
- `contamination`
- `training_window_days`
- `trained_from`
- `trained_to`
- `trained_at`
- `training_sample_count`
- `timezone`
- `artifact`
- `summary`
- `is_active`
- `status`
- `superseded_at`

Notas:

- `artifact` guarda el modelo serializado
- solo un modelo activo por device debe considerarse fuente de scoring

#### `device_reading_features`

Propósito:

- materializar el vector de features usado para entrenamiento y scoring

Relaciones:

- `N:1` hacia `device_readings`
- `N:1` hacia `devices`

Campos clave:

- `reading_id`
- `device_id`
- `ts`
- `local_date`
- `feature_schema_version`
- `timezone`
- `day_group`
- `local_hour`
- `day_of_week`
- `apower`
- `aenergy_delta`
- `output_numeric`
- `hour_sin`
- `hour_cos`
- `day_of_week_sin`
- `day_of_week_cos`
- `delta_power_prev`
- `rolling_mean_power_5`
- `rolling_std_power_5`

Restricciones:

- unicidad por `reading_id + feature_schema_version`

#### `device_anomaly_predictions`

Propósito:

- guardar el resultado del scoring por lectura

Relaciones:

- `N:1` hacia `device_readings`
- `N:1` hacia `devices`
- `N:1` opcional hacia `device_anomaly_models`
- `N:1` opcional hacia `anomaly_events`

Campos clave:

- `reading_id` único
- `device_id`
- `model_id`
- `anomaly_event_id`
- `scored_at`
- `score`
- `decision_function`
- `is_anomaly`
- `status`
- `details`

Notas:

- representa el nivel granular por lectura
- una predicción puede quedar ligada a un incidente agrupado mediante `anomaly_event_id`

#### `anomaly_events`

Propósito:

- persistir incidentes agrupados por racha de anomalías a nivel device

Relaciones:

- `N:1` hacia `devices`
- `N:1` opcional hacia `device_anomaly_models`
- `N:1` opcional hacia `device_readings` usando la lectura que abrió el incidente
- `1:N` con `device_anomaly_predictions`
- `1:N` con `notification_logs`

Campos clave:

- `device_id`
- `model_id`
- `prediction_id`
- `reading_id`
- `status`
- `readings_count`
- `detected_at`
- `window_start`
- `window_end`
- `anomaly_type`
- `severity`
- `score`
- `expected_value`
- `observed_value`
- `details`

Restricciones e índices:

- índices por `device_id, detected_at` y `device_id, status, detected_at`
- en DB existe índice único parcial para permitir solo un incidente `open` por `device`

Notas:

- `prediction_id` y `reading_id` conservan trazabilidad al primer disparo del incidente
- el incidente se extiende con nuevas predicciones anómalas cercanas en el tiempo

#### `user_push_tokens`

Propósito:

- guardar tokens push por usuario para notificaciones futuras

Relaciones:

- `N:1` hacia `users`

Campos clave:

- `user_id`
- `token` único
- `platform`
- `is_active`
- `last_seen_at`

Notas:

- la tabla existe, pero el flujo de push todavía no está implementado de punta a punta

#### `notification_logs`

Propósito:

- auditar intentos de envío de notificaciones por canal

Relaciones:

- `N:1` hacia `users`
- `N:1` opcional hacia `anomaly_events`

Campos clave:

- `user_id`
- `anomaly_event_id`
- `sent_at`
- `channel`
- `status`
- `error_message`

#### `job_locks`

Propósito:

- lock distribuido para jobs batch

Campos clave:

- `key`
- `owner_id`
- `expires_at`
- timestamps de creación y actualización

Notas:

- evita que polling o aggregates se ejecuten en paralelo en procesos distintos

## 14.1 Flujo ML actual

### Entrenamiento

Resumen:

1. `job-aggregates.ts` ejecuta `runDeviceUsageAggregationOnce()`
2. por cada device elegible, primero materializa `device_usage_hourly` y `device_usage_daily`
3. luego llama `trainDeviceAnomalyModel(deviceId)`
4. `trainDeviceAnomalyModel()` revisa en `device_usage_daily` si existen `ML_TRAINING_WINDOW_DAYS` días locales cerrados y contiguos
5. si no existe esa ventana completa, el device queda sin modelo activo
6. si existe, el backend genera o completa `device_reading_features` a partir de `device_readings`
7. el backend manda `trainingRows` al `ml-service` por `POST /train`
8. el `ml-service` entrena `IsolationForest`
9. el backend guarda el artefacto serializado del modelo en `device_anomaly_models`
10. si ya había un modelo activo del mismo device, lo marca como `superseded`

Reglas actuales:

- el modelo es uno por `device`
- la ventana de entrenamiento se define con `ML_TRAINING_WINDOW_DAYS`
- el entrenamiento usa `device_usage_daily` para decidir elegibilidad y `device_readings` para construir features
- si el modelo activo ya tiene el mismo `trainedTo`, no se reentrena
- en práctica, el reentrenamiento ocurre como máximo una vez por nuevo día local cerrado por device

### Scoring

Resumen:

1. polling inserta una fila nueva en `device_readings`
2. después llama `scoreDeviceReading(readingId)`
3. el backend arma el `featureVector` de esa lectura usando la lectura actual y lecturas previas del mismo device
4. el feature se guarda en `device_reading_features`
5. el backend busca el modelo activo del device en `device_anomaly_models`
6. si no existe modelo, guarda una predicción `model_not_ready`
7. si existe, manda `artifact + featureVector` al `ml-service` por `POST /score`
8. el `ml-service` deserializa el modelo y scorea la lectura
9. el backend guarda el resultado en `device_anomaly_predictions`
10. si `isAnomaly=true`, crea o extiende un incidente en `anomaly_events`

Reglas actuales:

- todas las lecturas nuevas de un mismo device usan el mismo modelo activo de ese device
- el `ml-service` es stateless: no guarda modelos en memoria permanente ni habla con Postgres
- el backend es quien decide qué modelo usar y lo recupera desde DB
- `device_anomaly_predictions` guarda el detalle por lectura
- `anomaly_events` agrupa esas lecturas en incidentes

### Features actuales

- `apower`
- `aenergyDelta`
- `outputNumeric`
- `hourSin`
- `hourCos`
- `dayOfWeekSin`
- `dayOfWeekCos`
- `deltaPowerPrev`
- `rollingMeanPower5`
- `rollingStdPower5`

### Dónde vive físicamente el modelo

- la implementación del algoritmo vive en `scikit-learn IsolationForest`
- el modelo entrenado de cada device vive en la tabla `device_anomaly_models`
- el campo `artifact` guarda el modelo serializado con `pickle` y codificado en base64
- el `ml-service` reconstruye el modelo en memoria solo durante cada request de `/score`

## 14.2 Prueba manual local

### Levantar `ml-service`

```bash
cd ml-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
set -a
source .env
set +a
uvicorn app.main:app --host "${ML_SERVICE_HOST:-0.0.0.0}" --port "${ML_SERVICE_PORT:-8000}" --log-level "${ML_SERVICE_LOG_LEVEL:-info}"
```

Health check:

```bash
curl http://localhost:8000/health
```

### Preparar backend para pruebas locales

Valores mínimos en `backend/.env`:

```env
ML_ENABLED=true
ML_SERVICE_BASE_URL=http://localhost:8000
ML_TRAINING_WINDOW_DAYS=13
ML_IF_CONTAMINATION=0.02
```

Si el ambiente todavía no tiene 30 días cerrados, bajar `ML_TRAINING_WINDOW_DAYS` permite crear el primer modelo con menos historia.

### Entrenar un `device` manualmente

Script disponible:

- `npm run ml:train-device -- <deviceId>`

Ese script:

- llama `trainDeviceAnomalyModel(deviceId)`
- usa la data real ya existente en Postgres
- crea o refresca el modelo activo del device si la ventana cerrada es válida
- imprime `result` y el `activeModel`

### Scorear un `reading` manualmente

Script disponible:

- `npm run ml:score-reading -- <readingId>`

Ese script:

- llama `scoreDeviceReading(readingId)`
- guarda la predicción en `device_anomaly_predictions`
- si aplica, crea `anomaly_events`
- imprime `result`, `prediction` y `anomalyEvent`

## 15. Estado funcional actual

### Implementado

- registro/login/logout/refresh/me
- CRUD de Homes
- CRUD de Devices
- ownership por Home y Device
- integración Shelly OAuth completa
- estado de integración Shelly
- discover Shelly
- import Shelly a `devices`
- refresh manual de token Shelly
- borrado de integración Shelly
- polling Shelly para `device_readings`
- job de agregación horaria y diaria para `device_usage_hourly` y `device_usage_daily`
- scoring de anomalías por lectura nueva desde el polling
- endpoint `GET /devices/:deviceId/state`
- endpoint `GET /devices/:deviceId/anomalies`
- entrenamiento/reentrenamiento ML con `IsolationForest`
- separación entre servidor HTTP y jobs batch
- jobs one-shot para polling y aggregates

### No implementado completamente todavía

- endpoints crudos para inspección de modelos y predicciones por lectura
- envío de notificaciones push

## 16. Principios de diseño que sigue el backend

- modularidad por dominio
- controllers delgados
- validación de request antes de entrar a lógica de negocio
- ownership explícito por middleware
- credenciales Shelly solo en backend
- integración Shelly desacoplada en OAuth, discovery y polling
- parser de payload Shelly tolerante a respuestas heterogéneas
- scheduler simple in-process para MVP

## 17. Fuente de verdad y mantenimiento

Este documento debe considerarse la fuente de verdad funcional del backend actual.

Si se cambian:

- rutas
- tablas Prisma
- lógica de polling
- flujo OAuth Shelly
- ownership middleware

entonces este archivo debe actualizarse en la misma iteración.
