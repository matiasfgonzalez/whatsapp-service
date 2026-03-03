import express from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { logAudit, getRequestIp } from '../lib/auditLog.js';
import {
  hashApiKey,
  getKeyHint,
  encryptApiKey,
  decryptApiKey,
} from '../lib/apiKeyHash.js';

const router = express.Router();

/**
 * Genera una API Key segura con prefijo para fácil identificación.
 * Formato: whsvc_<32 caracteres hex>
 */
const generateApiKey = () => {
  const key = crypto.randomBytes(32).toString('hex');
  return `whsvc_${key}`;
};

/**
 * POST /api/v1/api-keys
 * Crea o retorna una API Key existente para el usuario logueado.
 * No requiere body — usa el usuario de la sesión Clerk (req.dbUser).
 *
 * Requiere: Authorization: Bearer <clerk_token>
 *
 * Response: { apiKey: "whsvc_...", created: true|false }
 */
router.post('/', async (req, res) => {
  try {
    const user = req.dbUser;

    // Si ya tiene una API Key activa, retornar solo el hint (la key completa ya no se puede recuperar)
    if (user.apiKey && user.apiKey.active) {
      return res.json({
        message: 'Ya tienes una API Key activa',
        apiKey: user.apiKey.keyHint,
        created: false,
        createdAt: user.apiKey.createdAt,
      });
    }

    // Crear nueva API Key
    const newKey = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        keyHash: hashApiKey(newKey),
        keyHint: getKeyHint(newKey),
        keyEncrypted: encryptApiKey(newKey),
        userId: user.id,
      },
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: 'api_key.created',
      resource: apiKey.id,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    // IMPORTANTE: El texto plano solo se muestra esta única vez
    res.status(201).json({
      message:
        'API Key creada exitosamente. Guardala de forma segura, no se volverá a mostrar.',
      apiKey: newKey,
      created: true,
      createdAt: apiKey.createdAt,
    });
  } catch (err) {
    console.error('❌ Error al crear/obtener API Key:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/v1/api-keys
 * Obtiene la API Key del usuario logueado.
 *
 * Requiere: Authorization: Bearer <clerk_token>
 */
router.get('/', async (req, res) => {
  try {
    const user = req.dbUser;

    if (!user.apiKey) {
      return res.status(404).json({
        error:
          'No tienes una API Key. Usa POST /api/v1/api-keys para crear una.',
      });
    }

    // Si tenemos la key encriptada, desencriptar para mostrar al usuario
    // Si no (key creada antes de la migración), indicar que necesita regenerar
    let apiKeyValue = user.apiKey.keyHint;
    let needsMigration = false;

    if (user.apiKey.keyEncrypted) {
      try {
        apiKeyValue = decryptApiKey(user.apiKey.keyEncrypted);
      } catch (err) {
        console.warn(
          '⚠️  No se pudo desencriptar la API Key, mostrando hint:',
          err.message,
        );
        needsMigration = true;
      }
    } else {
      // Key creada antes de la migración — no se puede recuperar
      needsMigration = true;
    }

    res.json({
      apiKey: apiKeyValue,
      active: user.apiKey.active,
      createdAt: user.apiKey.createdAt,
      lastUsed: user.apiKey.lastUsed,
      expiresAt: user.apiKey.expiresAt,
      needsMigration,
    });
  } catch (err) {
    console.error('❌ Error al obtener API Key:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/v1/api-keys
 * Desactiva la API Key del usuario logueado.
 *
 * Requiere: Authorization: Bearer <clerk_token>
 */
router.delete('/', async (req, res) => {
  try {
    const user = req.dbUser;

    if (!user.apiKey) {
      return res.status(404).json({
        error: 'No tienes una API Key para desactivar',
      });
    }

    await prisma.apiKey.update({
      where: { userId: user.id },
      data: { active: false },
    });

    await logAudit({
      userId: user.id,
      action: 'api_key.deactivated',
      resource: user.apiKey.id,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'API Key desactivada correctamente' });
  } catch (err) {
    console.error('❌ Error al desactivar API Key:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/v1/api-keys/regenerate
 * Regenera la API Key del usuario logueado (invalida la anterior).
 *
 * Requiere: Authorization: Bearer <clerk_token>
 */
router.post('/regenerate', async (req, res) => {
  try {
    const user = req.dbUser;
    const newKey = generateApiKey();

    const apiKey = await prisma.apiKey.upsert({
      where: { userId: user.id },
      update: {
        keyHash: hashApiKey(newKey),
        keyHint: getKeyHint(newKey),
        keyEncrypted: encryptApiKey(newKey),
        active: true,
        createdAt: new Date(),
      },
      create: {
        keyHash: hashApiKey(newKey),
        keyHint: getKeyHint(newKey),
        keyEncrypted: encryptApiKey(newKey),
        userId: user.id,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'api_key.regenerated',
      resource: apiKey.id,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    // IMPORTANTE: El texto plano solo se muestra esta única vez
    res.json({
      message:
        'API Key regenerada exitosamente. Guardala de forma segura, no se volverá a mostrar.',
      apiKey: newKey,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    });
  } catch (err) {
    console.error('❌ Error al regenerar API Key:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
