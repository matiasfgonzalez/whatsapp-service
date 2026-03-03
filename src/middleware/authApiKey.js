import prisma from '../lib/prisma.js';
import { hashApiKey } from '../lib/apiKeyHash.js';

/**
 * Middleware que valida la API Key enviada en el header `x-api-key`.
 * Compara el hash SHA-256 de la key recibida contra el hash almacenado en DB.
 * Si la key es válida y activa, adjunta el usuario al request (req.user).
 * Actualiza la fecha de último uso de la API Key.
 */
const authApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'API Key requerida. Envía el header "x-api-key"',
    });
  }

  try {
    // Hashear la key recibida y buscar por hash
    const incomingHash = hashApiKey(apiKey);

    const keyRecord = await prisma.apiKey.findUnique({
      where: { keyHash: incomingHash },
      include: {
        user: {
          select: {
            id: true,
            clerkId: true,
            name: true,
            email: true,
            active: true,
          },
        },
      },
    });

    if (!keyRecord) {
      return res.status(401).json({ error: 'API Key inválida' });
    }

    if (!keyRecord.active) {
      return res.status(403).json({ error: 'API Key desactivada' });
    }

    // Verificar expiración si tiene fecha de expiración
    if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
      return res.status(403).json({ error: 'API Key expirada' });
    }

    if (!keyRecord.user.active) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    // Actualizar último uso (fire-and-forget)
    prisma.apiKey
      .update({
        where: { keyHash: incomingHash },
        data: { lastUsed: new Date() },
      })
      .catch((err) => console.error('Error actualizando lastUsed:', err));

    // Adjuntar usuario al request
    req.user = keyRecord.user;
    req.apiKeyId = keyRecord.id;
    next();
  } catch (err) {
    console.error('❌ Error en autenticación por API Key:', err);
    res.status(500).json({ error: 'Error interno de autenticación' });
  }
};

export default authApiKey;
