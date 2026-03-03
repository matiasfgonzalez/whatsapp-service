import express from 'express';
import prisma from '../lib/prisma.js';
import { logAudit, getRequestIp } from '../lib/auditLog.js';

const router = express.Router();

/**
 * POST /api/v1/users/me
 * Obtiene o crea el usuario en nuestra DB a partir de la sesión de Clerk.
 * El middleware authClerk ya se encargó de sincronizar el usuario.
 *
 * Requiere: Authorization: Bearer <clerk_token>
 * El middleware authClerk adjunta req.dbUser automáticamente.
 */
router.post('/me', async (req, res) => {
  try {
    const user = req.dbUser;

    // Registrar en audit log
    await logAudit({
      userId: user.id,
      action: 'user.sync',
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: 'Usuario sincronizado correctamente',
      user: {
        id: user.id,
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        hasApiKey: !!user.apiKey?.active,
      },
    });
  } catch (err) {
    console.error('❌ Error al sincronizar usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/v1/users/me
 * Obtiene los datos del usuario logueado.
 *
 * Requiere: Authorization: Bearer <clerk_token>
 */
router.get('/me', async (req, res) => {
  try {
    const user = req.dbUser;

    res.json({
      user: {
        id: user.id,
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        active: user.active,
        apiKey: user.apiKey
          ? {
              active: user.apiKey.active,
              createdAt: user.apiKey.createdAt,
              lastUsed: user.apiKey.lastUsed,
              // Solo mostrar el hint almacenado, nunca la key completa
              keyHint: user.apiKey.keyHint,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('❌ Error al obtener usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
