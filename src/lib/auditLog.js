import prisma from '../lib/prisma.js';

/**
 * Registra una acción en el audit log.
 *
 * @param {Object} params
 * @param {string} params.userId    - ID del usuario en nuestra DB
 * @param {string} params.action    - Acción realizada (e.g. "api_key.created")
 * @param {string} [params.resource] - Recurso afectado (e.g. businessId)
 * @param {string} [params.ip]      - IP del request
 * @param {string} [params.userAgent] - User-Agent del request
 * @param {Object} [params.metadata] - Datos adicionales
 */
export const logAudit = async ({
  userId,
  action,
  resource,
  ip,
  userAgent,
  metadata,
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        ip,
        userAgent,
        metadata,
      },
    });
  } catch (err) {
    // No bloquear la respuesta si falla el audit log
    console.error('❌ Error registrando audit log:', err);
  }
};

/**
 * Helper para extraer IP del request.
 */
export const getRequestIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
};
