# Energy Sentinel AI Frontend

## Pantallas tentativas para app móvil

Este documento propone las pantallas del frontend móvil tomando como base el backend actual ya implementado en `backend/`.

La idea es separar:

- pantallas necesarias para el MVP funcional
- pantallas de soporte o administración
- pantallas que conviene dejar para después porque el backend todavía no expone todo lo necesario

## 1. Objetivo del frontend móvil

La app móvil debe permitir que un usuario:

- cree sesión y mantenga su sesión activa
- conecte su cuenta Shelly
- descubra e importe dispositivos Shelly
- vea sus homes y devices
- vea el estado actual de cada device
- consulte consumo histórico por device y por home
- consulte anomalías por device

Con el backend actual, eso ya es viable sin bloquear el inicio del frontend.

## 2. Pantallas MVP

### 2.1 Splash / Bootstrap

Propósito:

- validar si existe sesión activa
- redirigir a login o a la app principal

Qué consume:

- almacenamiento local de access token y refresh token
- `POST /auth/refresh` si la sesión necesita renovarse
- `GET /auth/me`

Notas:

- no necesita UI compleja
- también puede servir para cargar configuración inicial

### 2.2 Login

Propósito:

- iniciar sesión con email y password

Qué consume:

- `POST /auth/login`

Estado esperado:

- guardar tokens
- navegar a la app principal

### 2.3 Registro

Propósito:

- crear cuenta nueva

Qué consume:

- `POST /auth/register`

### 2.4 Home Selector / Lista de Homes

Propósito:

- listar los homes del usuario
- dejar elegir el home activo

Qué consume:

- `GET /homes`

Notas:

- si el usuario solo tiene un home, esta pantalla puede saltarse y entrar directo al dashboard del home
- sigue siendo útil dejarla porque el backend sí soporta múltiples homes

### 2.5 Dashboard del Home

Propósito:

- ser la pantalla principal del home seleccionado
- mostrar devices del home
- mostrar consumo histórico del home

Qué consume:

- `GET /homes/:homeId`
- `GET /homes/:homeId/devices`
- `GET /homes/:homeId/consumption`

Contenido recomendado:

- nombre del home
- lista resumida de devices
- gráfica de consumo del hogar
- accesos rápidos a integración Shelly, importación y detalle de devices

Nota importante:

- hoy el backend da consumo histórico del home, no snapshot actual del home en tiempo real

### 2.6 Lista de Devices del Home

Propósito:

- ver todos los devices asociados a un home

Qué consume:

- `GET /homes/:homeId/devices`

Contenido recomendado:

- nombre del device
- estado básico
- acceso al detalle del device

Nota:

- para mostrar consumo instantáneo o última lectura en la lista, el frontend tendría que hacer llamadas a `GET /devices/:deviceId/state`
- para el MVP es aceptable mostrar una lista simple y cargar snapshot solo al entrar al detalle

### 2.7 Detalle de Device

Propósito:

- ser la pantalla más importante del producto a nivel operativo
- mostrar snapshot actual, consumo histórico y anomalías recientes del device

Qué consume:

- `GET /devices/:deviceId`
- `GET /devices/:deviceId/state`
- `GET /devices/:deviceId/consumption`
- `GET /devices/:deviceId/anomalies`

Contenido recomendado:

- nombre del device
- última lectura disponible
- estado del modelo de anomalías
- indicador de anomalía activa si existe
- gráfica de consumo
- lista corta de anomalías recientes

### 2.8 Historial de Anomalías por Device

Propósito:

- ver todos los incidentes de anomalía de un device

Qué consume:

- `GET /devices/:deviceId/anomalies`

Filtros útiles en UI:

- `all`
- `open`
- `closed`
- rango temporal

Nota:

- esta pantalla sí tiene sentido como pantalla separada si el detalle del device muestra solo las últimas anomalías

### 2.9 Estado Actual del Device

Propósito:

- vista enfocada en snapshot actual del device

Qué consume:

- `GET /devices/:deviceId/state`

Cuándo conviene separarla:

- si el detalle del device termina siendo una pantalla con tabs
- por ejemplo:
  - tab `Resumen`
  - tab `Consumo`
  - tab `Anomalías`

Si no usas tabs, esta pantalla puede quedar absorbida por `Detalle de Device`.

### 2.10 Integración Shelly

Propósito:

- mostrar estado de conexión con Shelly
- iniciar flujo OAuth

Qué consume:

- `GET /integrations/shelly`
- `POST /integrations/shelly/oauth/start`
- callback público manejado por backend

Contenido recomendado:

- estado de integración
- último refresh exitoso si lo quieres mostrar
- botón para conectar o reconectar

### 2.11 Descubrimiento de Devices Shelly

Propósito:

- listar devices encontrados en la cuenta Shelly antes de importarlos al inventario local

Qué consume:

- `POST /integrations/shelly/discovery`

Contenido recomendado:

- lista de devices descubiertos
- cuáles ya están importados
- cuáles faltan por importar

### 2.12 Importación de Devices Shelly

Propósito:

- importar uno o varios devices descubiertos al home elegido

Qué consume:

- `POST /integrations/shelly/import`

Notas:

- esta pantalla puede vivir pegada al flujo de discovery
- no hace falta separarla si el diseño usa un solo flujo tipo wizard

## 3. Pantallas de soporte recomendadas

### 3.1 Perfil / Cuenta

Propósito:

- mostrar datos básicos del usuario
- cerrar sesión

Qué consume:

- `GET /auth/me`
- `POST /auth/logout`

### 3.2 Crear / Editar Home

Propósito:

- soportar CRUD de homes desde la app

Qué consume:

- `POST /homes`
- `PATCH /homes/:homeId`
- `DELETE /homes/:homeId`

Nota:

- si el MVP va a asumir un solo home creado desde onboarding, esta pantalla puede postergarse

### 3.3 Editar Device

Propósito:

- cambiar nombre visible o datos editables del device

Qué consume:

- `PATCH /devices/:deviceId`
- `DELETE /devices/:deviceId`

Nota:

- útil, pero no crítica para arrancar el frontend

## 4. Onboarding sugerido

Un flujo razonable de primera vez sería:

1. `Splash`
2. `Login` o `Registro`
3. `Home Selector` o creación inicial de home
4. `Integración Shelly`
5. `Discovery + Import`
6. `Dashboard del Home`
7. `Detalle de Device`

Ese flujo encaja bien con el backend ya existente.

## 5. Pantallas que todavía no conviene construir como definitivas

### 5.1 Centro de notificaciones push

Motivo:

- el backend todavía no implementa envío real de push notifications
- tampoco está cerrado el manejo de tokens push

Conclusión:

- la UX de push debe dejarse provisional o fuera del MVP

### 5.2 Pantalla global de anomalías de todo el home o de toda la cuenta

Motivo:

- el backend actual expone anomalías por device
- no existe todavía un endpoint agregado global de anomalías por home

Conclusión:

- por ahora conviene entrar a anomalías desde el detalle de cada device

### 5.3 Centro avanzado de analítica o insights

Motivo:

- el backend actual sí tiene consumo y anomalías, pero no una capa de insights explicativos, comparativas o recomendaciones

Conclusión:

- si luego quieres una pantalla tipo "Insights", será un slice nuevo de producto y backend

## 6. Propuesta de navegación base

Una navegación móvil simple podría ser:

- Tab 1: `Home`
- Tab 2: `Devices`
- Tab 3: `Cuenta`

Y desde ahí navegar por stack a:

- `Detalle de Device`
- `Historial de Anomalías`
- `Integración Shelly`
- `Discovery / Import`
- `Editar Home`
- `Editar Device`

Otra opción razonable:

- `Home`
- `Devices`
- `Integración`
- `Cuenta`

Eso depende de qué tan frecuente esperas que el usuario conecte o reconfigure Shelly.

## 7. Priorización real para empezar frontend ya

Si quieres arrancar sin sobreconstruir, yo priorizaría estas pantallas primero:

1. `Splash`
2. `Login`
3. `Registro`
4. `Home Selector`
5. `Dashboard del Home`
6. `Detalle de Device`
7. `Historial de Anomalías por Device`
8. `Integración Shelly`
9. `Discovery / Import`
10. `Cuenta`

Con eso ya puedes recorrer el flujo principal del producto.

## 8. Resumen ejecutivo

Con el backend actual, el frontend móvil ya puede construirse alrededor de estos ejes:

- autenticación
- selección de home
- consumo histórico
- snapshot actual de devices
- anomalías por device
- integración Shelly e importación de devices

Lo único claramente fuera del MVP backend para frontend es:

- push notifications reales
- UX global de anomalías agregadas más allá del nivel device
