import { clerkClient, verifyToken } from '@clerk/express';
import prisma from '../lib/prisma.js';

// ── In-memory cache para evitar llamar a Clerk getUser() en cada request ──
// Key: clerkId, Value: { data, timestamp }
const clerkUserCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCachedClerkUser(clerkId) {
  const entry = clerkUserCache.get(clerkId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    clerkUserCache.delete(clerkId);
    return null;
  }
  return entry.data;
}

function setCachedClerkUser(clerkId, data) {
  clerkUserCache.set(clerkId, { data, timestamp: Date.now() });
  // Evitar memory leak: limitar tamaño del cache
  if (clerkUserCache.size > 1000) {
    const oldest = clerkUserCache.keys().next().value;
    clerkUserCache.delete(oldest);
  }
}

/**
 * Middleware que verifica el JWT de Clerk enviado como Bearer token.
 * Extrae datos del usuario de Clerk y sincroniza/crea el usuario en nuestra DB.
 *
 * Después de pasar este middleware:
 *   - req.clerkUser  → datos del usuario en Clerk (id, email, name, imageUrl)
 *   - req.dbUser     → registro del usuario en nuestra DB (con apiKey incluida)
 *
 * El frontend debe enviar el header:
 *   Authorization: Bearer <clerk_session_token>
 *
 * Optimización: usa cache in-memory (TTL 5 min) para evitar llamar a
 * clerkClient.users.getUser() en cada request (+100-300ms).
 */
const authClerk = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error:
        'Token de autenticación requerido. Envía el header "Authorization: Bearer <token>"',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verificar el token JWT de Clerk (validación local, rápida)
    const { sub: clerkId } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!clerkId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Intentar obtener el usuario de DB directamente (skip Clerk API si ya existe)
    let dbUser = await prisma.user.findUnique({
      where: { clerkId },
      include: { apiKey: true },
    });

    // Obtener datos de Clerk: desde cache o API remota
    let clerkData = getCachedClerkUser(clerkId);

    if (!clerkData) {
      // Solo llamar a Clerk API si:
      // 1. No hay cache, Y
      // 2. El usuario no existe en DB (primera vez) o necesitamos sincronizar
      const clerkUser = await clerkClient.users.getUser(clerkId);
      clerkData = {
        clerkId: clerkUser.id,
        email: clerkUser.emailAddresses?.[0]?.emailAddress || '',
        name:
          `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() ||
          'Sin nombre',
        imageUrl: clerkUser.imageUrl || null,
      };
      setCachedClerkUser(clerkId, clerkData);
    }

    req.clerkUser = clerkData;

    if (!dbUser) {
      // Auto-crear usuario en nuestra DB la primera vez
      dbUser = await prisma.user.create({
        data: {
          clerkId: clerkData.clerkId,
          name: clerkData.name,
          email: clerkData.email,
          imageUrl: clerkData.imageUrl,
        },
        include: { apiKey: true },
      });
    } else {
      // Actualizar datos si cambiaron en Clerk
      if (
        dbUser.name !== clerkData.name ||
        dbUser.email !== clerkData.email ||
        dbUser.imageUrl !== clerkData.imageUrl
      ) {
        dbUser = await prisma.user.update({
          where: { clerkId: clerkData.clerkId },
          data: {
            name: clerkData.name,
            email: clerkData.email,
            imageUrl: clerkData.imageUrl,
          },
          include: { apiKey: true },
        });
      }
    }

    if (!dbUser.active) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    req.dbUser = dbUser;
    next();
  } catch (err) {
    console.error('❌ Error en autenticación Clerk:', err);

    if (err.message?.includes('expired') || err.message?.includes('jwt')) {
      return res.status(401).json({ error: 'Token expirado o inválido' });
    }

    res.status(500).json({ error: 'Error interno de autenticación' });
  }
};

export default authClerk;
