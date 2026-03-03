import authApiKey from './authApiKey.js';
import authClerk from './authClerk.js';

/**
 * Middleware de autenticación dual para rutas de WhatsApp.
 *
 * Acepta DOS métodos de autenticación:
 *   1. API Key (header `x-api-key`) — para integraciones externas/programáticas
 *   2. Clerk JWT (header `Authorization: Bearer <token>`) — para el dashboard
 *
 * Normaliza el resultado: siempre deja `req.user` con { id, clerkId, name, email, active }.
 */
const authApiKeyOrClerk = async (req, res, next) => {
  // 1. Si tiene x-api-key, autenticar por API Key (hash comparison)
  if (req.headers['x-api-key']) {
    return authApiKey(req, res, next);
  }

  // 2. Si tiene Bearer token, autenticar por Clerk JWT
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return authClerk(req, res, () => {
      // Normalizar: authClerk pone req.dbUser, pero las rutas usan req.user
      req.user = {
        id: req.dbUser.id,
        clerkId: req.dbUser.clerkId,
        name: req.dbUser.name,
        email: req.dbUser.email,
        active: req.dbUser.active,
      };
      next();
    });
  }

  // Sin credenciales
  return res.status(401).json({
    error:
      'Autenticación requerida. Envía el header "x-api-key" o "Authorization: Bearer <token>"',
  });
};

export default authApiKeyOrClerk;
