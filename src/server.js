import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import whatsappRoutes from './routes/whatsappRoutes.js';
import userRoutes from './routes/userRoutes.js';
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import whatsappManager from './whatsapp/whatsappManager.js';
import prisma from './lib/prisma.js';
import authClerk from './middleware/authClerk.js';
import authApiKey from './middleware/authApiKey.js';
import authApiKeyOrClerk from './middleware/authApiKeyOrClerk.js';

dotenv.config();

const app = express();

// ─── Seguridad ───────────────────────────────────────────
app.use(helmet());

// CORS — restringir orígenes en producción
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*'];

app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  }),
);

// Rate limiting global
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'production' ? 1000 : 10000, // 1000 en dev, 100 en prod
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes, intenta más tarde' },
  }),
);

// ─── Body parsing ────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Health check ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Rutas ───────────────────────────────────────────────

// Rutas protegidas por Clerk (usuario logueado desde el frontend)
app.use('/api/v1/users', authClerk, userRoutes);
app.use('/api/v1/api-keys', authClerk, apiKeyRoutes);

// Rutas protegidas por API Key O Clerk JWT (dashboard + integraciones externas)
app.use('/api/v1/whatsapp', authApiKeyOrClerk, whatsappRoutes);

// Mantener ruta legacy por compatibilidad (solo API Key)
app.use('/whatsapp', authApiKey, whatsappRoutes);

// ─── 404 ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── Manejo global de errores ────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Error no controlado:', err);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Error interno del servidor'
        : err.message,
  });
});

// ─── Iniciar servidor ────────────────────────────────────
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Service running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
});

// ─── Graceful shutdown ───────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n🛑 ${signal} recibido. Cerrando sesiones...`);
  await whatsappManager.destroyAll();
  await prisma.$disconnect();
  server.close(() => {
    console.log('👋 Servidor cerrado correctamente');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
