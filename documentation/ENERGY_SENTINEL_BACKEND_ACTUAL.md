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
  lib/
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
  server.ts
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

- arrancar el scheduler in-process al boot del backend
- correr inmediatamente una vez y luego cada `SHELLY_POLLING_INTERVAL_MS`
- paginar integraciones activas
- procesar varias integraciones con límite de concurrencia
- ingerir lecturas por device desde `switch:0`

Reglas actuales:

- si el polling está deshabilitado por ENV, no arranca
- el scheduler evita corridas superpuestas con un guard en memoria
- el job se detiene al recibir `SIGINT` o `SIGTERM`

#### `shelly/shared`

Responsabilidades:

- construir URLs Shelly correctas por `user_api_url`
- hacer requests HTTP a Shelly
- decodificar JWT Shelly sin verificar firma
- normalizar payloads discovery y readings
- encapsular helpers repetidos de Prisma sobre la integración Shelly

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

### 7.5 Integración Shelly

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

1. `server.ts` arranca `startShellyReadingsPolling()`
2. si el polling está habilitado, corre una vez inmediatamente
3. luego programa `setInterval`
4. cada corrida pagina integraciones activas
5. para cada integración:
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

Protecciones del scheduler:

- guard in-memory para no solapar corridas
- stop limpio al recibir `SIGINT` o `SIGTERM`

## 13. Variables de entorno relevantes

### Generales

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`

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

Comportamiento actual:

- si `SHELLY_POLLING_ENABLED` no existe, el polling queda activo excepto en `NODE_ENV=test`

## 14. Modelo de datos actual

### Implementado y en uso activo

- `users`
- `refresh_tokens`
- `homes`
- `shelly_integrations`
- `shelly_oauth_states`
- `devices`
- `device_readings`

### Ya modelado en Prisma, pero no completamente expuesto por endpoints/jobs aún

- `device_usage_hourly`
- `device_usage_daily`
- `device_baselines`
- `anomaly_events`
- `user_push_tokens`
- `notification_logs`

### Resumen por tabla

#### `users`

- identidad del usuario del backend

#### `refresh_tokens`

- refresh tokens hasheados
- expiración y revocación

#### `homes`

- agrupación lógica de devices por usuario
- incluye `timezone`

#### `shelly_integrations`

- vínculo 1:1 usuario <-> cuenta Shelly
- `auth_code`
- `access_token`
- `access_token_expires_at`
- `user_api_url`
- `status`
- `last_sync_at`

#### `shelly_oauth_states`

- `state` temporal del flujo OAuth
- expiración y consumo

#### `devices`

- inventario local de devices ya importados
- ownership por `userId`
- pertenencia a `homeId`
- unicidad por `userId + externalDeviceId`

#### `device_readings`

- telemetría cruda ingerida desde Shelly
- unicidad por `deviceId + ts`
- usa nombres alineados a `switch:0`

#### `device_usage_hourly` y `device_usage_daily`

- tablas preparadas para agregados
- aún no documentadas como flujo activo productivo en este backend

#### `device_baselines` y `anomaly_events`

- tablas preparadas para fase de detección de anomalías
- aún sin pipeline completo activo en este backend

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

### No implementado completamente todavía

- agregación horaria y diaria como job activo
- entrenamiento de baselines
- detección de anomalías
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
