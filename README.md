# 📱 WhatsApp Service

> Servicio REST API multi-sesión para WhatsApp Web, construido con Node.js, Express y [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

Permite a múltiples negocios o usuarios conectar sus cuentas de WhatsApp simultáneamente a través de una API HTTP sencilla. Cada sesión es independiente, con su propia autenticación por código QR y persistencia local.

---

## 📑 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [API Endpoints](#-api-endpoints)
- [Flujo de Conexión](#-flujo-de-conexión)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Seguridad](#-seguridad)
- [MVP — Producto Mínimo Viable](#-mvp--producto-mínimo-viable)
- [Roadmap](#-roadmap)
- [Solución de Problemas](#-solución-de-problemas)
- [Licencia](#-licencia)

---

## ✨ Características

| Característica                     | Descripción                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Multi-sesión**                   | Múltiples cuentas de WhatsApp conectadas en paralelo, cada una identificada por un `businessId` |
| **Autenticación por QR**           | Genera códigos QR en formato base64 (data URL) listos para renderizar en cualquier frontend     |
| **Persistencia de sesión**         | Las sesiones se guardan localmente con `LocalAuth`; no requiere escanear QR en cada reinicio    |
| **Envío de mensajes**              | Envía mensajes de texto a cualquier número de WhatsApp vía API                                  |
| **Gestión de sesiones**            | Iniciar, consultar estado, listar, reiniciar y cerrar sesiones completas                        |
| **Graceful shutdown**              | Al detener el servidor, todas las sesiones se cierran limpiamente                               |
| **Seguridad**                      | Helmet, CORS configurable, rate limiting global                                                 |
| **Protección anti race-condition** | Evita inicializaciones duplicadas simultáneas de la misma sesión                                |

---

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                      Cliente / Frontend                 │
│              (cualquier app, Postman, curl)              │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTP REST
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     Express Server                       │
│                                                          │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────────┐ │
│  │  Helmet   │  │   CORS     │  │   Rate Limiter       │ │
│  └──────────┘  └────────────┘  └──────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              /api/v1/whatsapp (Router)            │    │
│  │  POST /init  GET /qr  POST /send  GET /status    │    │
│  │  GET /sessions  POST /logout  POST /restart      │    │
│  └──────────────────────────┬───────────────────────┘    │
└─────────────────────────────┼────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                   WhatsAppManager                        │
│                    (Singleton)                            │
│                                                          │
│   clients: Map<businessId, Client>                       │
│   qrCodes: Map<businessId, base64>                       │
│   initializing: Set<businessId>                          │
│                                                          │
│   initSession()  sendMessage()  logout()                 │
│   getQR()  isConnected()  getSessionStatus()             │
│   listSessions()  restart()  destroyAll()                │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│               whatsapp-web.js (Puppeteer)                │
│                                                          │
│  Instancia de Chromium headless por cada sesión activa   │
│  Persistencia en ./sessions/<businessId>/                │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Requisitos Previos

- **Node.js** >= 18.x (se usa ES Modules y `--watch`)
- **npm** >= 9.x
- **Google Chrome / Chromium** instalado en el sistema (requerido por Puppeteer/whatsapp-web.js)
- Sistema operativo: **Windows**, **macOS** o **Linux**

> ⚠️ whatsapp-web.js necesita un navegador Chromium. En servidores Linux sin GUI, asegúrate de tener las dependencias de Chromium instaladas (`apt install -y libgbm-dev libnss3 libatk-bridge2.0-0 ...`).

---

## 🚀 Instalación

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd whatsapp-service

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env según tus necesidades

# 4. Iniciar en desarrollo (con hot-reload)
npm run dev

# 4b. O iniciar en producción
npm start
```

El servidor estará disponible en `http://localhost:3001` (o el puerto configurado).

---

## ⚙ Configuración

Las variables de entorno se definen en el archivo `.env`:

| Variable          | Descripción                                                                                          | Valor por defecto |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ----------------- |
| `PORT`            | Puerto en el que escucha el servidor                                                                 | `3001`            |
| `ALLOWED_ORIGINS` | Orígenes permitidos para CORS, separados por coma. Usa `*` para permitir todos                       | `*`               |
| `NODE_ENV`        | Entorno de ejecución (`development` / `production`). En producción los errores se ocultan al cliente | `development`     |

Archivo `.env.example` incluido como referencia.

---

## 💡 Uso

### Flujo típico paso a paso

```bash
# 1️⃣  Iniciar una sesión para un negocio
curl -X POST http://localhost:3001/api/v1/whatsapp/init \
  -H "Content-Type: application/json" \
  -d '{"businessId": "mi-negocio"}'

# 2️⃣  Obtener el código QR (escanear con WhatsApp)
curl http://localhost:3001/api/v1/whatsapp/qr/mi-negocio
# → Retorna { "qr": "data:image/png;base64,..." }

# 3️⃣  Verificar que la sesión está conectada
curl http://localhost:3001/api/v1/whatsapp/status/mi-negocio
# → { "businessId": "mi-negocio", "connected": true, "status": "connected" }

# 4️⃣  Enviar un mensaje
curl -X POST http://localhost:3001/api/v1/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "mi-negocio",
    "to": "5491112345678",
    "message": "¡Hola desde la API!"
  }'

# 5️⃣  Cerrar la sesión cuando ya no se necesite
curl -X POST http://localhost:3001/api/v1/whatsapp/logout \
  -H "Content-Type: application/json" \
  -d '{"businessId": "mi-negocio"}'
```

---

## 📡 API Endpoints

Base URL: `/api/v1/whatsapp` (también disponible en `/whatsapp` por compatibilidad legacy)

### `GET /health`

Health check del servidor (no requiere prefijo).

**Respuesta:**

```json
{
  "status": "ok",
  "uptime": 123.456
}
```

---

### `POST /init`

Inicializa una nueva sesión de WhatsApp.

**Body:**

```json
{
  "businessId": "mi-negocio"
}
```

| Campo        | Tipo     | Requerido | Reglas                                                 |
| ------------ | -------- | --------- | ------------------------------------------------------ |
| `businessId` | `string` | ✅        | Alfanumérico, guiones y guiones bajos. 3–50 caracteres |

**Respuestas:**

| Código | Caso                                             |
| ------ | ------------------------------------------------ |
| `200`  | Sesión inicializada o ya existente               |
| `400`  | `businessId` inválido                            |
| `500`  | Error al inicializar (Puppeteer, Chromium, etc.) |

```json
// Sesión nueva
{ "message": "Sesión inicializada correctamente" }

// Sesión ya existente
{ "message": "La sesión ya existe", "status": "connected" }

// En proceso
{ "message": "La sesión se está inicializando, espera un momento" }
```

---

### `GET /qr/:businessId`

Obtiene el código QR en formato base64 (data URL PNG).

**Respuesta exitosa (`200`):**

```json
{
  "qr": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Respuesta si no hay QR (`404`):**

```json
{
  "error": "QR no disponible",
  "sessionStatus": "connected",
  "hint": "La sesión ya está conectada, no necesita QR"
}
```

> 💡 Para mostrar el QR en HTML: `<img src="${qr}" />`

---

### `POST /send`

Envía un mensaje de texto.

**Body:**

```json
{
  "businessId": "mi-negocio",
  "to": "5491112345678",
  "message": "¡Hola desde la API!"
}
```

| Campo        | Tipo     | Requerido | Reglas                                             |
| ------------ | -------- | --------- | -------------------------------------------------- |
| `businessId` | `string` | ✅        | 3–50 caracteres alfanuméricos                      |
| `to`         | `string` | ✅        | Número con código de país, sin `+` (10–15 dígitos) |
| `message`    | `string` | ✅        | Máximo 4096 caracteres                             |

**Respuesta exitosa (`200`):**

```json
{
  "success": true,
  "data": {
    "id": "3EB0A0B4F3...",
    "to": "5491112345678@c.us",
    "timestamp": 1740700000
  }
}
```

**Posibles errores:**

| Código | Caso                                    |
| ------ | --------------------------------------- |
| `400`  | Campos inválidos o cliente no conectado |
| `404`  | Sesión no encontrada                    |

---

### `GET /status/:businessId`

Estado de conexión de una sesión.

**Respuesta (`200`):**

```json
{
  "businessId": "mi-negocio",
  "connected": true,
  "status": "connected"
}
```

**Estados posibles:** `connected`, `connecting`, `waiting_qr`, `initializing`, `disconnected`, `not_found`

---

### `GET /sessions`

Lista todas las sesiones activas en memoria.

**Respuesta (`200`):**

```json
{
  "count": 2,
  "sessions": [
    { "businessId": "mi-negocio", "status": "connected", "hasQR": false },
    { "businessId": "otro-negocio", "status": "waiting_qr", "hasQR": true }
  ]
}
```

---

### `POST /logout`

Cierra y destruye una sesión de WhatsApp.

**Body:**

```json
{
  "businessId": "mi-negocio"
}
```

**Respuesta (`200`):**

```json
{ "message": "Sesión cerrada correctamente" }
```

---

### `POST /restart`

Reinicia una sesión (logout + init).

**Body:**

```json
{
  "businessId": "mi-negocio"
}
```

**Respuesta (`200`):**

```json
{ "message": "Sesión inicializada correctamente" }
```

---

## 🔄 Flujo de Conexión

```
POST /init           GET /qr/:id              Escanear QR
    │                    │                    con WhatsApp
    ▼                    ▼                        │
┌────────┐        ┌────────────┐                  │
│ Init   │───────▶│ Esperando  │◀─── QR generado  │
│ Session│        │ QR scan    │                   │
└────────┘        └─────┬──────┘                   │
                        │         QR escaneado ◄───┘
                        ▼
                  ┌────────────┐
                  │ Autenticado│
                  │ & Conectado│
                  └─────┬──────┘
                        │
                        ▼
                  ┌────────────┐     POST /send
                  │   Listo    │◄─── Enviar mensajes
                  │   para     │
                  │   operar   │
                  └─────┬──────┘
                        │
              POST /logout │ POST /restart
                        ▼
                  ┌────────────┐
                  │  Sesión    │
                  │  cerrada   │
                  └────────────┘
```

---

## 📂 Estructura del Proyecto

```
whatsapp-service/
├── .env                          # Variables de entorno (no versionado)
├── .env.example                  # Plantilla de variables de entorno
├── .gitignore                    # Archivos ignorados por Git
├── package.json                  # Dependencias y scripts
├── package-lock.json             # Lock de dependencias
├── README.md                     # Este archivo
│
├── src/
│   ├── server.js                 # Punto de entrada — Express, middlewares, arranque
│   ├── routes/
│   │   └── whatsappRoutes.js     # Rutas REST — validación y orquestación
│   └── whatsapp/
│       └── whatsappManager.js    # Lógica de negocio — gestión multi-sesión de WhatsApp
│
└── sessions/                     # Datos de sesión persistidos por LocalAuth (no versionado)
    └── session-<businessId>/     # Una carpeta por cada sesión activa
```

### Descripción de archivos clave

| Archivo                           | Responsabilidad                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server.js`                   | Configura Express con Helmet, CORS, rate limiting. Define health check, monta rutas y maneja graceful shutdown                                                    |
| `src/routes/whatsappRoutes.js`    | Define los 7 endpoints REST. Valida parámetros de entrada (`businessId`, `to`, `message`) y delega al manager                                                     |
| `src/whatsapp/whatsappManager.js` | Clase singleton `WhatsAppManager`. Gestiona el ciclo de vida completo de las sesiones: init, QR, conexión, envío, logout, destroy. Protege contra race conditions |

---

## 🔐 Seguridad

| Capa                      | Implementación                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Helmet**                | Headers de seguridad HTTP (X-Content-Type-Options, X-Frame-Options, CSP, etc.)                                |
| **CORS**                  | Configurable por variable de entorno. En producción, limitar a los orígenes necesarios                        |
| **Rate Limiting**         | 100 requests por IP cada 15 minutos (global)                                                                  |
| **Validación de entrada** | `businessId` validado con regex `^[a-zA-Z0-9_-]{3,50}$`. Campos `to` y `message` validados en tipo y longitud |
| **Errores en producción** | Cuando `NODE_ENV=production`, los mensajes de error internos no se exponen al cliente                         |
| **Body limit**            | `express.json` limitado a 1 MB                                                                                |

### Recomendaciones para producción

- Configurar `ALLOWED_ORIGINS` con los dominios específicos de tu frontend
- Añadir autenticación (API key, JWT, etc.) como middleware antes de las rutas
- Usar HTTPS (con reverse proxy como Nginx o Caddy)
- Monitorear el consumo de memoria (cada sesión consume ~50-100 MB por la instancia de Chromium)
- Ejecutar detrás de un process manager (PM2, systemd)

---

## 🎯 MVP — Producto Mínimo Viable

### ¿Qué es este proyecto?

Un **microservicio backend** que expone WhatsApp como un canal de mensajería accesible vía API REST. Pensado para que aplicaciones web, CRMs, sistemas de turnos o bots puedan enviar y recibir mensajes de WhatsApp sin depender de la API oficial de Meta (Business API).

### Funcionalidades del MVP actual

| #   | Funcionalidad                                  | Estado          |
| --- | ---------------------------------------------- | --------------- |
| 1   | Crear/iniciar sesiones de WhatsApp por negocio | ✅ Implementado |
| 2   | Generar QR en base64 para vincular cuenta      | ✅ Implementado |
| 3   | Persistencia de sesión (no re-escanear QR)     | ✅ Implementado |
| 4   | Enviar mensajes de texto                       | ✅ Implementado |
| 5   | Consultar estado de sesiones                   | ✅ Implementado |
| 6   | Listar todas las sesiones activas              | ✅ Implementado |
| 7   | Cerrar/reiniciar sesiones                      | ✅ Implementado |
| 8   | Multi-sesión (múltiples negocios simultáneos)  | ✅ Implementado |
| 9   | Graceful shutdown                              | ✅ Implementado |
| 10  | Seguridad básica (Helmet, CORS, rate limit)    | ✅ Implementado |

### ¿Qué NO incluye el MVP?

- ❌ Recepción de mensajes (webhook de mensajes entrantes)
- ❌ Envío de archivos multimedia (imágenes, documentos, audio)
- ❌ Autenticación de la API (API key / JWT)
- ❌ Base de datos para historial de mensajes
- ❌ Panel de administración / Dashboard
- ❌ Webhooks para notificaciones de estado
- ❌ Cola de mensajes para envíos masivos
- ❌ Tests automatizados
- ❌ Docker / contenedorización
- ❌ Documentación OpenAPI / Swagger

---

## 🗺 Roadmap

### Fase 2 — Comunicación Bidireccional

- [ ] Webhook para recepción de mensajes entrantes
- [ ] Eventos de cambio de estado de sesión via webhook
- [ ] Soporte para mensajes multimedia (imágenes, PDF, audio, video)

### Fase 3 — Seguridad y Escalabilidad

- [ ] Autenticación de API (API key + JWT)
- [ ] Rate limiting por sesión/negocio
- [ ] Cola de mensajes (Bull/BullMQ + Redis) para envíos masivos
- [ ] Docker + Docker Compose
- [ ] Tests unitarios e integración (Vitest/Jest)

### Fase 4 — Observabilidad y Operaciones

- [ ] Logging estructurado (Winston/Pino)
- [ ] Métricas y monitoreo (Prometheus, Grafana)
- [ ] Documentación OpenAPI/Swagger interactiva
- [ ] Dashboard de administración

### Fase 5 — Funcionalidades Avanzadas

- [ ] Plantillas de mensajes
- [ ] Mensajes programados
- [ ] Chatbot con flujo configurable
- [ ] Grupos de WhatsApp (crear, enviar, gestionar)

---

## 🔧 Solución de Problemas

### El QR no se genera

- Verifica que Chromium/Chrome esté instalado y accesible
- En Linux sin GUI, instala las dependencias: `apt install -y libgbm-dev libnss3 libatk-bridge2.0-0 libx11-xcb1`
- Revisa los logs de la consola para errores de Puppeteer

### La sesión no persiste después de reiniciar

- Verifica que la carpeta `sessions/` existe y tiene permisos de escritura
- No borres la carpeta `sessions/session-<businessId>/` manualmente

### Error "Demasiadas solicitudes"

- Se alcanzó el rate limit (100 req/15 min por IP)
- Espera 15 minutos o ajusta la configuración en `server.js`

### Alto consumo de memoria

- Cada sesión abre una instancia de Chromium headless (~50-100 MB)
- Limita el número de sesiones simultáneas según la RAM disponible
- Cierra sesiones que no estén en uso con `POST /logout`

---

## 📦 Dependencias

| Paquete                                                                | Versión | Propósito                                  |
| ---------------------------------------------------------------------- | ------- | ------------------------------------------ |
| [express](https://expressjs.com/)                                      | ^5.2.1  | Framework web HTTP                         |
| [whatsapp-web.js](https://wwebjs.dev/)                                 | ^1.34.6 | Cliente de WhatsApp Web vía Puppeteer      |
| [qrcode](https://www.npmjs.com/package/qrcode)                         | ^1.5.4  | Generación de QR en base64                 |
| [helmet](https://helmetjs.github.io/)                                  | ^8.1.0  | Headers de seguridad HTTP                  |
| [cors](https://www.npmjs.com/package/cors)                             | ^2.8.6  | Cross-Origin Resource Sharing              |
| [express-rate-limit](https://www.npmjs.com/package/express-rate-limit) | ^8.2.1  | Limitación de requests por IP              |
| [dotenv](https://www.npmjs.com/package/dotenv)                         | ^17.3.1 | Carga de variables de entorno desde `.env` |

---

## 📄 Licencia

ISC
