# 📱 WhatsApp Service

> Servicio REST API multi-sesión para WhatsApp Web, construido con Node.js, Express, [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js), Prisma ORM y autenticación dual (Clerk + API Key).

Permite a múltiples negocios o usuarios conectar sus cuentas de WhatsApp simultáneamente a través de una API HTTP segura. Cada sesión es independiente, con su propia autenticación por código QR y persistencia local. Incluye gestión de usuarios vía Clerk, generación de API Keys por usuario, y audit log de actividad.

---

## 📑 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Autenticación — Cómo funciona](#-autenticación--cómo-funciona)
- [Guía paso a paso — Todos los casos de uso](#-guía-paso-a-paso--todos-los-casos-de-uso)
- [API Endpoints — Referencia completa](#-api-endpoints--referencia-completa)
- [Integración con Frontend (React + Clerk)](#-integración-con-frontend-react--clerk)
- [Probar con Postman](#-probar-con-postman)
- [Flujo de Conexión WhatsApp](#-flujo-de-conexión-whatsapp)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Seguridad](#-seguridad)
- [MVP — Producto Mínimo Viable](#-mvp--producto-mínimo-viable)
- [Roadmap](#-roadmap)
- [Solución de Problemas](#-solución-de-problemas)
- [Licencia](#-licencia)

---

## ✨ Características

| Característica                     | Descripción                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Multi-sesión**                   | Múltiples cuentas de WhatsApp conectadas en paralelo, cada una identificada por un `businessId` vinculado al usuario |
| **Autenticación por QR**           | Genera códigos QR en formato base64 (data URL) listos para renderizar en cualquier frontend                          |
| **Persistencia de sesión**         | Las sesiones se guardan localmente con `LocalAuth`; no requiere escanear QR en cada reinicio                         |
| **Envío de mensajes**              | Envía mensajes de texto a cualquier número de WhatsApp vía API                                                       |
| **Gestión de sesiones**            | Iniciar, consultar estado, listar, reiniciar y cerrar sesiones completas                                             |
| **Autenticación Clerk**            | Las rutas de usuario y API Keys se protegen con JWT de Clerk (frontend logueado)                                     |
| **API Keys por usuario**           | Cada usuario genera su propia API Key para usar las rutas de WhatsApp                                                |
| **Audit Log**                      | Todas las acciones importantes se registran en base de datos con IP, user-agent y timestamp                          |
| **Auto-sync de usuarios**          | Los datos de Clerk se sincronizan automáticamente en cada request                                                    |
| **Base de datos PostgreSQL**       | Modelos de User, ApiKey y AuditLog gestionados con Prisma ORM (Neon compatible)                                      |
| **Graceful shutdown**              | Al detener el servidor, todas las sesiones y conexiones se cierran limpiamente                                       |
| **Aislamiento de negocios**        | Cada `businessId` queda vinculado al usuario que lo creó; nadie más puede operar esa sesión                          |
| **Seguridad**                      | Helmet, CORS configurable, rate limiting global                                                                      |
| **Protección anti race-condition** | Evita inicializaciones duplicadas simultáneas de la misma sesión                                                     |

---

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                      Cliente / Frontend                 │
│            (React + Clerk, Postman, curl, etc.)          │
└──────────────┬──────────────────────┬───────────────────┘
               │                      │
   Bearer Token (Clerk)         x-api-key Header
               │                      │
               ▼                      ▼
┌─────────────────────────────────────────────────────────┐
│                     Express Server                       │
│                                                          │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────────┐ │
│  │  Helmet   │  │   CORS     │  │   Rate Limiter       │ │
│  └──────────┘  └────────────┘  └──────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Middleware: authClerk (Bearer Token)              │  │
│  │  → /api/v1/users/*     (gestión de usuarios)      │  │
│  │  → /api/v1/api-keys/*  (gestión de API Keys)      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Middleware: authApiKey (x-api-key header)         │  │
│  │  → /api/v1/whatsapp/*  (operaciones WhatsApp)     │  │
│  └──────────────────────────┬─────────────────────────┘  │
└─────────────────────────────┼────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────┐  ┌────────────────┐  ┌──────────────────┐
│ PostgreSQL   │  │ WhatsAppManager│  │   Audit Log      │
│ (Neon)       │  │  (Singleton)   │  │   (DB)           │
│              │  │                │  │                   │
│ Users        │  │ clients: Map   │  │ Registra acciones │
│ ApiKeys      │  │ qrCodes: Map   │  │ con IP, agent,   │
│ Businesses   │  │ initializing   │  │ timestamp         │
│ AuditLogs    │  │                │  │                   │
└──────────────┘  └───────┬────────┘  └──────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  whatsapp-web.js      │
              │  (Puppeteer/Chromium) │
              │  1 instancia por      │
              │  sesión activa        │
              └───────────────────────┘
```

---

## 📋 Requisitos Previos

- **Node.js** >= 18.x (se usa ES Modules y `--watch`)
- **npm** >= 9.x
- **Google Chrome / Chromium** instalado en el sistema (requerido por Puppeteer/whatsapp-web.js)
- **Base de datos PostgreSQL** (recomendado: [Neon](https://neon.tech))
- **Cuenta en Clerk** para autenticación de usuarios ([dashboard.clerk.com](https://dashboard.clerk.com))
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
# Editar .env con tus credenciales (ver sección Configuración)

# 4. Crear las tablas en la base de datos
npx prisma migrate dev

# 5. Generar el cliente de Prisma
npx prisma generate

# 6. Iniciar en desarrollo (con hot-reload)
npm run dev

# 6b. O iniciar en producción
npm start
```

El servidor estará disponible en `http://localhost:3001` (o el puerto configurado).

---

## ⚙ Configuración

Las variables de entorno se definen en el archivo `.env`:

| Variable                | Descripción                                                                                          | Valor por defecto | Requerido |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ----------------- | --------- |
| `PORT`                  | Puerto en el que escucha el servidor                                                                 | `3001`            | No        |
| `ALLOWED_ORIGINS`       | Orígenes permitidos para CORS, separados por coma. Usa `*` para permitir todos                       | `*`               | No        |
| `NODE_ENV`              | Entorno de ejecución (`development` / `production`). En producción los errores se ocultan al cliente | `development`     | No        |
| `DATABASE_URL`          | URL de conexión a PostgreSQL (Neon, Supabase, local, etc.)                                           | —                 | **Sí**    |
| `CLERK_SECRET_KEY`      | Secret Key de tu aplicación en Clerk                                                                 | —                 | **Sí**    |
| `CLERK_PUBLISHABLE_KEY` | Publishable Key de tu aplicación en Clerk                                                            | —                 | **Sí**    |

### Ejemplo de `.env`

```env
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,https://mi-app.com
NODE_ENV=development
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
```

> 🔑 Las claves de Clerk las encuentras en [dashboard.clerk.com](https://dashboard.clerk.com) → tu aplicación → **API Keys**.

---

## 🔐 Autenticación — Cómo funciona

Esta API usa **dos capas de autenticación** independientes según el tipo de operación:

### Capa 1: Clerk (Bearer Token) — Para el frontend

Las rutas de **gestión de usuario** y **API Keys** se protegen con el JWT de Clerk. El frontend (React, Next.js, etc.) envía el session token de Clerk como Bearer token.

```
Authorization: Bearer <clerk_session_token>
```

**Rutas protegidas por Clerk:**

- `/api/v1/users/*` — Gestión de usuario
- `/api/v1/api-keys/*` — Crear, ver, desactivar y regenerar tu API Key

**¿Qué hace el middleware?**

1. Verifica el JWT de Clerk
2. Obtiene los datos del usuario de Clerk (nombre, email, avatar)
3. Busca o **crea automáticamente** el usuario en la base de datos local
4. Sincroniza los datos si cambiaron en Clerk
5. Adjunta el usuario a `req.dbUser` para que las rutas lo usen

### Capa 2: API Key (Header) — Para operaciones WhatsApp

Las rutas de **WhatsApp** se protegen con una API Key que el usuario genera desde el frontend.

```
x-api-key: whsvc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Rutas protegidas por API Key:**

- `/api/v1/whatsapp/*` — Iniciar sesiones, enviar mensajes, etc.

**¿Qué hace el middleware?**

1. Valida que la API Key exista y esté activa
2. Verifica que no esté expirada
3. Verifica que el usuario asociado esté activo
4. Registra la fecha de último uso
5. Adjunta el usuario a `req.user`

### Capa 3: Propiedad de negocio (Business Ownership)

Además de la autenticación, **cada `businessId` queda vinculado al usuario que lo crea**. Esto garantiza:

- **Aislamiento total:** Un usuario no puede ver, enviar mensajes, ni operar sesiones de otro usuario
- **Auto-registro:** Al hacer `POST /init` con un `businessId` nuevo, se registra automáticamente como propiedad del usuario
- **Rechazo de intrusos:** Si un usuario intenta usar un `businessId` que ya pertenece a otro, recibe `403 Forbidden`
- **Filtrado de sesiones:** `GET /sessions` y `POST /send-message` solo operan sobre las sesiones del usuario autenticado

```
Usuario A (API Key A) → businessId: "peluqueria"    ✅ creado por A
Usuario B (API Key B) → businessId: "peluqueria"    ❌ 403 Forbidden
Usuario B (API Key B) → businessId: "cafeteria"     ✅ creado por B
Usuario B (API Key B) → GET /sessions               → solo ve "cafeteria"
```

### ¿Por qué dos capas?

| Operación                  | Auth           | Ownership             | Razón                                               |
| -------------------------- | -------------- | --------------------- | --------------------------------------------------- |
| Gestionar usuario/API Keys | Clerk (Bearer) | —                     | Son acciones del usuario logueado en el frontend    |
| Crear sesión WhatsApp      | API Key        | Auto-registra negocio | Vincula el businessId al usuario que lo crea        |
| Operar sesión WhatsApp     | API Key        | Verifica propiedad    | Solo el dueño del businessId puede operar su sesión |

---

## 📖 Guía paso a paso — Todos los casos de uso

### Caso 1: Primer inicio — Registrar usuario y obtener API Key

Este es el flujo que debe ejecutar tu frontend cuando un usuario se loguea por primera vez.

**Paso 1 — Sincronizar usuario (el frontend llama después del login con Clerk)**

```bash
curl -X POST http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer <clerk_session_token>"
```

**Respuesta:**

```json
{
  "message": "Usuario sincronizado correctamente",
  "user": {
    "id": "a1b2c3d4-...",
    "clerkId": "user_2abc...",
    "name": "Juan Pérez",
    "email": "juan@email.com",
    "imageUrl": "https://img.clerk.com/...",
    "createdAt": "2026-03-01T20:00:00.000Z",
    "hasApiKey": false
  }
}
```

> 💡 **No necesitas enviar nombre ni email en el body.** El middleware extrae todo automáticamente del token de Clerk y crea el usuario en la DB si no existe.

**Paso 2 — Generar API Key**

```bash
curl -X POST http://localhost:3001/api/v1/api-keys \
  -H "Authorization: Bearer <clerk_session_token>"
```

**Respuesta (primera vez):**

```json
{
  "message": "API Key creada exitosamente",
  "apiKey": "whsvc_72368434e02c2ed6b6f85790c19fa31effc52c2982dbb7cf9dc6fbe6bf4f57b8",
  "created": true,
  "createdAt": "2026-03-01T21:00:00.000Z"
}
```

**Respuesta (si ya tiene una):**

```json
{
  "message": "Ya tienes una API Key activa",
  "apiKey": "whsvc_72368434e02c2ed6b6f85790c19fa31effc52c2982dbb7cf9dc6fbe6bf4f57b8",
  "created": false,
  "createdAt": "2026-03-01T21:00:00.000Z"
}
```

> 🔒 **Guarda la API Key** de forma segura en tu frontend (por ejemplo, en el estado del usuario o localStorage encriptado). La necesitarás para todas las operaciones de WhatsApp.

---

### Caso 2: Conectar WhatsApp — Iniciar sesión y escanear QR

Una vez que tienes tu API Key, puedes iniciar sesiones de WhatsApp.

**Paso 1 — Iniciar sesión (registra el businessId como tuyo)**

```bash
curl -X POST http://localhost:3001/api/v1/whatsapp/init \
  -H "Content-Type: application/json" \
  -H "x-api-key: whsvc_72368434e02c2ed6..." \
  -d '{"businessId": "mi-negocio", "name": "Mi Peluquería"}'
```

> 🔒 **La primera vez que usas un `businessId`, queda registrado como propiedad de tu usuario.** Ningún otro usuario podrá usar ese mismo businessId. El campo `name` es opcional y sirve como descripción.

**Respuesta:**

```json
{
  "message": "Sesión inicializada correctamente"
}
```

**Si otro usuario intenta usar tu businessId:**

```json
{
  "error": "Este businessId ya está registrado por otro usuario."
}
```

**Paso 2 — Obtener el código QR**

```bash
curl http://localhost:3001/api/v1/whatsapp/qr/mi-negocio \
  -H "x-api-key: whsvc_72368434e02c2ed6..."
```

**Respuesta:**

```json
{
  "qr": "data:image/png;base64,iVBORw0KGgo..."
}
```

> 💡 Para mostrar el QR en HTML: `<img src="${qr}" />`
>
> El QR puede tardar unos segundos en generarse. Si obtienes un 404, espera un momento y vuelve a intentar.

**Paso 3 — Escanear el QR con WhatsApp**

1. Abre WhatsApp en tu teléfono
2. Ve a **Ajustes → Dispositivos vinculados → Vincular un dispositivo**
3. Escanea el QR mostrado en tu frontend

**Paso 4 — Verificar la conexión**

```bash
curl http://localhost:3001/api/v1/whatsapp/status/mi-negocio \
  -H "x-api-key: whsvc_72368434e02c2ed6..."
```

**Respuesta:**

```json
{
  "businessId": "mi-negocio",
  "connected": true,
  "status": "connected"
}
```

---

### Caso 3: Enviar mensajes

**Opción A — Enviar a una sesión específica**

```bash
curl -X POST http://localhost:3001/api/v1/whatsapp/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: whsvc_72368434e02c2ed6..." \
  -d '{
    "businessId": "mi-negocio",
    "to": "5491112345678",
    "message": "¡Hola desde la API!"
  }'
```

**Respuesta:**

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

**Opción B — Enviar usando cualquier sesión conectada (auto-selección)**

```bash
curl -X POST http://localhost:3001/api/v1/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -H "x-api-key: whsvc_72368434e02c2ed6..." \
  -d '{
    "to": "5491112345678",
    "message": "¡Hola! El sistema eligió la sesión disponible."
  }'
```

> 💡 Esta opción es útil cuando no te importa desde qué sesión se envía el mensaje. El sistema elige automáticamente una de **tus** sesiones conectadas (nunca usará sesiones de otros usuarios).

---

### Caso 4: Gestionar sesiones

**Listar tus sesiones activas**

> Solo retorna sesiones de negocios que te pertenecen.

```bash
curl http://localhost:3001/api/v1/whatsapp/sessions \
  -H "x-api-key: whsvc_72368434e02c2ed6..."
```

```json
{
  "count": 2,
  "sessions": [
    { "businessId": "mi-negocio", "status": "connected", "hasQR": false },
    { "businessId": "otro-negocio", "status": "waiting_qr", "hasQR": true }
  ]
}
```

**Listar tus negocios registrados (con estado de sesión)**

```bash
curl http://localhost:3001/api/v1/whatsapp/businesses \
  -H "x-api-key: whsvc_72368434e02c2ed6..."
```

```json
{
  "count": 2,
  "businesses": [
    {
      "businessId": "mi-negocio",
      "name": "Mi Peluquería",
      "createdAt": "2026-03-01T21:00:00.000Z",
      "sessionStatus": "connected",
      "connected": true
    },
    {
      "businessId": "otro-negocio",
      "name": null,
      "createdAt": "2026-03-01T22:00:00.000Z",
      "sessionStatus": "not_found",
      "connected": false
    }
  ]
}
```

**Reiniciar una sesión**

```bash
curl -X POST http://localhost:3001/api/v1/whatsapp/restart \
  -H "Content-Type: application/json" \
  -H "x-api-key: whsvc_72368434e02c2ed6..." \
  -d '{"businessId": "mi-negocio"}'
```

**Cerrar/destruir una sesión**

```bash
curl -X POST http://localhost:3001/api/v1/whatsapp/logout \
  -H "Content-Type: application/json" \
  -H "x-api-key: whsvc_72368434e02c2ed6..." \
  -d '{"businessId": "mi-negocio"}'
```

---

### Caso 5: Gestionar tu API Key

Todas estas rutas requieren el Bearer token de Clerk.

**Ver tu API Key actual**

```bash
curl http://localhost:3001/api/v1/api-keys \
  -H "Authorization: Bearer <clerk_session_token>"
```

```json
{
  "apiKey": "whsvc_72368434e02c2ed6...",
  "active": true,
  "createdAt": "2026-03-01T21:00:00.000Z",
  "lastUsed": "2026-03-01T22:30:00.000Z",
  "expiresAt": null
}
```

**Regenerar tu API Key (invalida la anterior)**

```bash
curl -X POST http://localhost:3001/api/v1/api-keys/regenerate \
  -H "Authorization: Bearer <clerk_session_token>"
```

```json
{
  "message": "API Key regenerada exitosamente",
  "apiKey": "whsvc_nuevo_key_aqui...",
  "createdAt": "2026-03-01T21:00:00.000Z",
  "updatedAt": "2026-03-01T23:00:00.000Z"
}
```

> ⚠️ **Al regenerar, la API Key anterior deja de funcionar inmediatamente.** Actualiza la key en todos los lugares donde la uses.

**Desactivar tu API Key**

```bash
curl -X DELETE http://localhost:3001/api/v1/api-keys \
  -H "Authorization: Bearer <clerk_session_token>"
```

```json
{
  "message": "API Key desactivada correctamente"
}
```

---

### Caso 6: Consultar tu perfil

**Obtener datos del usuario logueado**

```bash
curl http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer <clerk_session_token>"
```

```json
{
  "user": {
    "id": "a1b2c3d4-...",
    "clerkId": "user_2abc...",
    "name": "Juan Pérez",
    "email": "juan@email.com",
    "imageUrl": "https://img.clerk.com/...",
    "createdAt": "2026-03-01T20:00:00.000Z",
    "active": true,
    "apiKey": {
      "active": true,
      "createdAt": "2026-03-01T21:00:00.000Z",
      "lastUsed": "2026-03-01T22:30:00.000Z",
      "keyHint": "...4f57b8"
    }
  }
}
```

> 🔒 Por seguridad, el `GET /users/me` solo muestra los últimos 8 caracteres de la API Key (`keyHint`). Para ver la key completa usa `GET /api-keys` o regénérala.

---

## 📡 API Endpoints — Referencia completa

### Rutas públicas

| Método | Ruta      | Auth | Descripción               |
| ------ | --------- | ---- | ------------------------- |
| `GET`  | `/health` | ❌   | Health check del servidor |

### Rutas protegidas por Clerk (Bearer Token)

Requieren header: `Authorization: Bearer <clerk_session_token>`

| Método   | Ruta                          | Descripción                              |
| -------- | ----------------------------- | ---------------------------------------- |
| `POST`   | `/api/v1/users/me`            | Sincronizar/crear usuario desde Clerk    |
| `GET`    | `/api/v1/users/me`            | Obtener datos del usuario logueado       |
| `POST`   | `/api/v1/api-keys`            | Crear API Key (o retornar existente)     |
| `GET`    | `/api/v1/api-keys`            | Ver tu API Key                           |
| `DELETE` | `/api/v1/api-keys`            | Desactivar tu API Key                    |
| `POST`   | `/api/v1/api-keys/regenerate` | Regenerar API Key (invalida la anterior) |

### Rutas protegidas por API Key

Requieren header: `x-api-key: whsvc_...`

| Método | Ruta                                  | Descripción                                                |
| ------ | ------------------------------------- | ---------------------------------------------------------- |
| `POST` | `/api/v1/whatsapp/init`               | Iniciar sesión de WhatsApp (registra businessId como tuyo) |
| `GET`  | `/api/v1/whatsapp/qr/:businessId`     | Obtener código QR en base64 (solo tus negocios)            |
| `POST` | `/api/v1/whatsapp/send`               | Enviar mensaje a una sesión específica (solo tus negocios) |
| `POST` | `/api/v1/whatsapp/send-message`       | Enviar mensaje usando cualquier sesión tuya conectada      |
| `GET`  | `/api/v1/whatsapp/status/:businessId` | Estado de conexión de una sesión (solo tus negocios)       |
| `GET`  | `/api/v1/whatsapp/sessions`           | Listar tus sesiones activas                                |
| `GET`  | `/api/v1/whatsapp/businesses`         | Listar tus negocios registrados con estado de sesión       |
| `POST` | `/api/v1/whatsapp/logout`             | Cerrar y destruir una sesión (solo tus negocios)           |
| `POST` | `/api/v1/whatsapp/restart`            | Reiniciar una sesión (solo tus negocios)                   |

### Códigos de error comunes

| Código | Significado                                                                     |
| ------ | ------------------------------------------------------------------------------- |
| `400`  | Parámetros inválidos (businessId, to, message)                                  |
| `401`  | Falta token de Clerk o API Key, o son inválidos                                 |
| `403`  | API Key desactivada/expirada, usuario desactivado, o businessId de otro usuario |
| `404`  | Recurso no encontrado (sesión, QR, usuario, API Key)                            |
| `409`  | Conflicto (e.g., email ya registrado)                                           |
| `429`  | Rate limit alcanzado (100 req/15 min por IP)                                    |
| `500`  | Error interno del servidor                                                      |
| `503`  | No hay sesiones de WhatsApp conectadas (para `send-message`)                    |

---

## 🖥 Integración con Frontend (React + Clerk)

### 1. Configurar Clerk en tu frontend

```bash
npm install @clerk/clerk-react
```

```jsx
// main.jsx
import { ClerkProvider } from '@clerk/clerk-react';

<ClerkProvider publishableKey="pk_test_...">
  <App />
</ClerkProvider>;
```

### 2. Hook para obtener el token y llamar a la API

```jsx
import { useAuth } from '@clerk/clerk-react';

function useWhatsAppService() {
  const { getToken } = useAuth();

  const API_BASE = 'http://localhost:3001/api/v1';

  // Llamadas con Clerk token (usuario logueado)
  const fetchWithClerk = async (path, options = {}) => {
    const token = await getToken();
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    }).then((res) => res.json());
  };

  // Llamadas con API Key (operaciones WhatsApp)
  const fetchWithApiKey = async (path, apiKey, options = {}) => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...options.headers,
      },
    }).then((res) => res.json());
  };

  return {
    // — Clerk auth —
    syncUser: () => fetchWithClerk('/users/me', { method: 'POST' }),
    getProfile: () => fetchWithClerk('/users/me'),
    createApiKey: () => fetchWithClerk('/api-keys', { method: 'POST' }),
    getApiKey: () => fetchWithClerk('/api-keys'),
    regenerateApiKey: () =>
      fetchWithClerk('/api-keys/regenerate', { method: 'POST' }),
    deleteApiKey: () => fetchWithClerk('/api-keys', { method: 'DELETE' }),

    // — API Key auth —
    initSession: (apiKey, businessId, name = null) =>
      fetchWithApiKey('/whatsapp/init', apiKey, {
        method: 'POST',
        body: JSON.stringify({ businessId, ...(name && { name }) }),
      }),
    listBusinesses: (apiKey) => fetchWithApiKey('/whatsapp/businesses', apiKey),
    getQR: (apiKey, businessId) =>
      fetchWithApiKey(`/whatsapp/qr/${businessId}`, apiKey),
    getStatus: (apiKey, businessId) =>
      fetchWithApiKey(`/whatsapp/status/${businessId}`, apiKey),
    sendMessage: (apiKey, businessId, to, message) =>
      fetchWithApiKey('/whatsapp/send', apiKey, {
        method: 'POST',
        body: JSON.stringify({ businessId, to, message }),
      }),
    listSessions: (apiKey) => fetchWithApiKey('/whatsapp/sessions', apiKey),
    logout: (apiKey, businessId) =>
      fetchWithApiKey('/whatsapp/logout', apiKey, {
        method: 'POST',
        body: JSON.stringify({ businessId }),
      }),
  };
}
```

### 3. Ejemplo de componente completo

```jsx
import { useUser } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';

function WhatsAppDashboard() {
  const { isSignedIn } = useUser();
  const api = useWhatsAppService();
  const [apiKey, setApiKey] = useState(null);
  const [qr, setQr] = useState(null);

  // Paso 1: Al montar, sincronizar usuario y obtener API Key
  useEffect(() => {
    if (!isSignedIn) return;

    const setup = async () => {
      // Sincronizar usuario
      await api.syncUser();

      // Obtener o crear API Key
      const { apiKey: key } = await api.createApiKey();
      setApiKey(key);
    };

    setup();
  }, [isSignedIn]);

  // Paso 2: Iniciar sesión de WhatsApp
  const handleInit = async () => {
    await api.initSession(apiKey, 'mi-negocio');

    // Esperar un momento para que el QR se genere
    setTimeout(async () => {
      const { qr: qrCode } = await api.getQR(apiKey, 'mi-negocio');
      setQr(qrCode);
    }, 3000);
  };

  // Paso 3: Enviar mensaje
  const handleSend = async () => {
    const result = await api.sendMessage(
      apiKey,
      'mi-negocio',
      '5491112345678',
      '¡Hola desde mi app!',
    );
    console.log('Mensaje enviado:', result);
  };

  return (
    <div>
      <p>API Key: {apiKey ? `...${apiKey.slice(-8)}` : 'Cargando...'}</p>

      <button onClick={handleInit}>Iniciar WhatsApp</button>

      {qr && <img src={qr} alt="QR WhatsApp" />}

      <button onClick={handleSend} disabled={!apiKey}>
        Enviar mensaje
      </button>
    </div>
  );
}
```

---

## 🧪 Probar con Postman

### Configuración inicial

1. Abre Postman y crea una nueva **Collection** llamada `WhatsApp Service`
2. En la colección, ve a la pestaña **Variables** y crea:

| Variable      | Valor                              |
| ------------- | ---------------------------------- |
| `base_url`    | `http://localhost:3001/api/v1`     |
| `api_key`     | _(tu API Key, la obtendrás abajo)_ |
| `clerk_token` | _(tu token de Clerk)_              |

---

### Paso 1 — Rutas con Clerk (Bearer Token)

Estas rutas son para gestionar tu usuario y API Key. Necesitas el token de sesión de Clerk.

#### ¿Cómo obtener el token de Clerk?

En tu frontend con Clerk, abre la consola del navegador (F12) y ejecuta:

```javascript
// Si usas React con @clerk/clerk-react
const token = await window.Clerk.session.getToken();
console.log(token);
```

Copia el token resultante.

#### Configurar el header en Postman

1. Crea un nuevo **Request**
2. En la pestaña **Headers**, agrega:

| Key             | Value                    |
| --------------- | ------------------------ |
| `Authorization` | `Bearer {{clerk_token}}` |
| `Content-Type`  | `application/json`       |

> 💡 **Tip:** También puedes ir a la pestaña **Authorization**, seleccionar tipo **Bearer Token**, y pegar tu token en el campo. Postman agrega el header automáticamente.

#### Sincronizar usuario

```
POST {{base_url}}/users/me
```

No requiere body. El middleware extrae todo del token.

#### Crear API Key

```
POST {{base_url}}/api-keys
```

No requiere body. Copia el valor de `apiKey` de la respuesta y guárdalo en la variable `api_key` de tu colección.

#### Ver tu API Key

```
GET {{base_url}}/api-keys
```

#### Regenerar API Key

```
POST {{base_url}}/api-keys/regenerate
```

> ⚠️ La key anterior deja de funcionar. Actualiza la variable `api_key`.

#### Ver tu perfil

```
GET {{base_url}}/users/me
```

---

### Paso 2 — Rutas con API Key (WhatsApp)

Estas rutas son para operar sesiones de WhatsApp. Usan el header `x-api-key`.

#### Configurar el header en Postman

1. Crea un nuevo **Request**
2. En la pestaña **Headers**, agrega:

| Key            | Value              |
| -------------- | ------------------ |
| `x-api-key`    | `{{api_key}}`      |
| `Content-Type` | `application/json` |

> 💡 **Tip:** Para no repetirlo en cada request, configúralo a nivel de **Collection**: click derecho en la colección → Edit → pestaña **Authorization** → tipo **API Key** → Key: `x-api-key`, Value: `{{api_key}}`, Add to: **Header**.

#### Iniciar sesión de WhatsApp

```
POST {{base_url}}/whatsapp/init
```

Body (JSON):

```json
{
  "businessId": "mi-negocio",
  "name": "Mi Peluquería"
}
```

#### Obtener QR

```
GET {{base_url}}/whatsapp/qr/mi-negocio
```

> 💡 Para ver el QR como imagen en Postman: copia el valor de `qr` de la respuesta (el string `data:image/png;base64,...`), pégalo en la barra de direcciones de tu navegador y escanéalo.

#### Verificar estado de conexión

```
GET {{base_url}}/whatsapp/status/mi-negocio
```

#### Enviar mensaje

```
POST {{base_url}}/whatsapp/send
```

Body (JSON):

```json
{
  "businessId": "mi-negocio",
  "to": "5491112345678",
  "message": "¡Hola desde Postman!"
}
```

#### Enviar mensaje (auto-selección de sesión)

```
POST {{base_url}}/whatsapp/send-message
```

Body (JSON):

```json
{
  "to": "5491112345678",
  "message": "¡Hola! El sistema elige mi sesión disponible."
}
```

#### Listar mis sesiones

```
GET {{base_url}}/whatsapp/sessions
```

#### Listar mis negocios registrados

```
GET {{base_url}}/whatsapp/businesses
```

#### Reiniciar sesión

```
POST {{base_url}}/whatsapp/restart
```

Body (JSON):

```json
{
  "businessId": "mi-negocio"
}
```

#### Cerrar sesión

```
POST {{base_url}}/whatsapp/logout
```

Body (JSON):

```json
{
  "businessId": "mi-negocio"
}
```

---

### Resumen rápido de headers

| Tipo de ruta                 | Header requerido                | Ejemplo                     |
| ---------------------------- | ------------------------------- | --------------------------- |
| **Clerk** (usuario/api-keys) | `Authorization: Bearer <token>` | `Bearer eyJhbGciOi...`      |
| **API Key** (whatsapp)       | `x-api-key: <tu_key>`           | `whsvc_72368434e02c2ed6...` |

> 🔒 Ambos headers son **obligatorios** para sus respectivas rutas. Sin ellos recibirás `401 Unauthorized`.

---

## 🔄 Flujo de Conexión WhatsApp

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
├── README.md                     # Este archivo
│
├── prisma/
│   ├── schema.prisma             # Modelos de datos (User, ApiKey, Business, AuditLog)
│   └── migrations/               # Migraciones de base de datos
│
├── src/
│   ├── server.js                 # Punto de entrada — Express, middlewares, arranque
│   ├── lib/
│   │   ├── prisma.js             # Singleton de Prisma Client
│   │   ├── auditLog.js           # Helper para registrar acciones en audit log
│   │   └── businessOwnership.js  # Lógica de propiedad de negocios (claim, verify)
│   ├── middleware/
│   │   ├── authClerk.js          # Middleware: verifica JWT de Clerk + auto-sync usuario
│   │   └── authApiKey.js         # Middleware: valida API Key + registra uso
│   ├── routes/
│   │   ├── userRoutes.js         # Rutas de gestión de usuario (/api/v1/users)
│   │   ├── apiKeyRoutes.js       # Rutas de gestión de API Keys (/api/v1/api-keys)
│   │   └── whatsappRoutes.js     # Rutas de WhatsApp (/api/v1/whatsapp)
│   └── whatsapp/
│       └── whatsappManager.js    # Lógica de negocio — gestión multi-sesión de WhatsApp
│
└── sessions/                     # Datos de sesión persistidos por LocalAuth (no versionado)
    └── session-<businessId>/     # Una carpeta por cada sesión activa
```

### Descripción de archivos clave

| Archivo                           | Responsabilidad                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/server.js`                   | Configura Express con Helmet, CORS, rate limiting. Monta rutas con sus middlewares de auth y maneja graceful shutdown |
| `src/middleware/authClerk.js`     | Verifica JWT de Clerk, sincroniza usuario en DB, adjunta `req.dbUser`                                                 |
| `src/middleware/authApiKey.js`    | Valida API Key, verifica expiración y estado activo, adjunta `req.user`                                               |
| `src/routes/userRoutes.js`        | Endpoints `POST /me` y `GET /me` para sincronizar y consultar el usuario logueado                                     |
| `src/routes/apiKeyRoutes.js`      | CRUD de API Keys (crear, ver, desactivar, regenerar) protegido por Clerk                                              |
| `src/routes/whatsappRoutes.js`    | 9 endpoints REST para WhatsApp. Verifica propiedad de businessId y delega al manager                                  |
| `src/lib/businessOwnership.js`    | Funciones `claimBusiness`, `verifyOwnership`, `getUserBusinessIds` para aislamiento de sesiones                       |
| `src/whatsapp/whatsappManager.js` | Clase singleton. Gestiona el ciclo de vida completo de las sesiones WhatsApp                                          |
| `src/lib/prisma.js`               | Instancia singleton de Prisma Client con logging configurable                                                         |
| `src/lib/auditLog.js`             | Helper `logAudit()` para registrar acciones con IP, user-agent y metadata                                             |
| `prisma/schema.prisma`            | Modelos de datos: `User`, `ApiKey`, `Business` (propiedad de sesiones), `AuditLog`                                    |

---

## 🔐 Seguridad

| Capa                       | Implementación                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Clerk JWT**              | Rutas de usuario y API Keys protegidas con token de sesión de Clerk                                           |
| **API Keys**               | Rutas de WhatsApp protegidas con API Key única por usuario (formato `whsvc_<64hex>`)                          |
| **Business Ownership**     | Cada businessId queda vinculado al usuario que lo crea; operaciones verifican propiedad antes de ejecutarse   |
| **Audit Log**              | Todas las acciones sensibles se registran con IP, user-agent, timestamp y metadata                            |
| **Helmet**                 | Headers de seguridad HTTP (X-Content-Type-Options, X-Frame-Options, CSP, etc.)                                |
| **CORS**                   | Configurable por variable de entorno con headers `Authorization` y `x-api-key` permitidos                     |
| **Rate Limiting**          | 100 requests por IP cada 15 minutos (global)                                                                  |
| **Validación de entrada**  | `businessId` validado con regex `^[a-zA-Z0-9_-]{3,50}$`. Campos `to` y `message` validados en tipo y longitud |
| **Auto-sync usuario**      | Los datos de Clerk se sincronizan en cada request, impidiendo datos desactualizados                           |
| **Expiración de API Keys** | Soporte para expiración opcional (`expiresAt`)                                                                |
| **Errores en producción**  | Cuando `NODE_ENV=production`, los mensajes de error internos no se exponen al cliente                         |
| **Body limit**             | `express.json` limitado a 1 MB                                                                                |

### Recomendaciones para producción

- Configurar `ALLOWED_ORIGINS` con los dominios específicos de tu frontend
- Usar HTTPS (con reverse proxy como Nginx o Caddy)
- Monitorear el consumo de memoria (cada sesión consume ~50-100 MB por la instancia de Chromium)
- Ejecutar detrás de un process manager (PM2, systemd)
- Configurar expiración de API Keys para mayor seguridad
- Revisar periódicamente los audit logs

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
| 11  | Autenticación Clerk (JWT)                      | ✅ Implementado |
| 12  | API Keys por usuario                           | ✅ Implementado |
| 13  | Base de datos PostgreSQL (Prisma + Neon)       | ✅ Implementado |
| 14  | Audit Log de actividad                         | ✅ Implementado |
| 15  | Auto-sync de usuarios desde Clerk              | ✅ Implementado |
| 16  | Aislamiento de negocios (Business Ownership)   | ✅ Implementado |

### ¿Qué NO incluye el MVP?

- ❌ Recepción de mensajes (webhook de mensajes entrantes)
- ❌ Envío de archivos multimedia (imágenes, documentos, audio)
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

### Fase 3 — Escalabilidad

- [ ] Rate limiting por usuario/API Key
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
| [@clerk/express](https://clerk.com/docs)                               | latest  | Verificación de JWT de Clerk en backend    |
| [@prisma/client](https://www.prisma.io/)                               | ^5.x    | ORM para acceder a PostgreSQL              |
| [prisma](https://www.prisma.io/)                                       | ^5.x    | CLI y motor de migraciones                 |
| [uuid](https://www.npmjs.com/package/uuid)                             | latest  | Generación de UUIDs                        |
| [helmet](https://helmetjs.github.io/)                                  | ^8.1.0  | Headers de seguridad HTTP                  |
| [cors](https://www.npmjs.com/package/cors)                             | ^2.8.6  | Cross-Origin Resource Sharing              |
| [express-rate-limit](https://www.npmjs.com/package/express-rate-limit) | ^8.2.1  | Limitación de requests por IP              |
| [dotenv](https://www.npmjs.com/package/dotenv)                         | ^17.3.1 | Carga de variables de entorno desde `.env` |

---

## 📄 Licencia

ISC
