import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import whatsappRoutes from './routes/whatsappRoutes.js';
import whatsappManager from './whatsapp/whatsappManager.js';

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
    methods: ['GET', 'POST'],
  }),
);

// Rate limiting global
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requests por IP
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
app.use('/api/v1/whatsapp', whatsappRoutes);

// Mantener ruta legacy por compatibilidad (opcional, quitar cuando migres)
app.use('/whatsapp', whatsappRoutes);

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
  server.close(() => {
    console.log('👋 Servidor cerrado correctamente');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
