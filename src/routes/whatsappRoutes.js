import express from 'express';
import whatsappManager from '../whatsapp/whatsappManager.js';
import { logAudit, getRequestIp } from '../lib/auditLog.js';
import {
  verifyOwnership,
  claimBusiness,
  getUserBusinessIds,
  getUserBusinesses,
  deactivateBusiness,
} from '../lib/businessOwnership.js';

const router = express.Router();

// ─── Validador de businessId ─────────────────────────────
const validateBusinessId = (businessId) => {
  if (!businessId || typeof businessId !== 'string') return false;
  // Solo alfanumérico, guiones y guiones bajos, 3-50 caracteres
  return /^[a-zA-Z0-9_-]{3,50}$/.test(businessId.trim());
};

/**
 * Helper: verifica propiedad de un businessId existente.
 * Retorna el business si es válido, o envía un error HTTP y retorna null.
 */
const requireOwnership = async (businessId, userId, res) => {
  const ownership = await verifyOwnership(businessId, userId);

  if (ownership === null) {
    res.status(404).json({
      error: `No tienes un negocio registrado con businessId "${businessId}". Usa POST /init para crearlo.`,
    });
    return null;
  }

  if (ownership.forbidden) {
    res.status(403).json({
      error:
        'No tienes permiso para operar esta sesión. El businessId pertenece a otro usuario.',
    });
    return null;
  }

  if (ownership.inactive) {
    res.status(403).json({
      error: 'Este negocio está desactivado.',
    });
    return null;
  }

  return ownership;
};

/**
 * POST /init — Iniciar sesión de WhatsApp
 * Body: { "businessId": "mi-negocio", "name": "Mi Negocio (opcional)" }
 *
 * Si el businessId no existe, se registra como propiedad del usuario autenticado.
 * Si ya existe y pertenece a otro usuario, se rechaza con 403.
 */
router.post('/init', async (req, res) => {
  const { businessId, name } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({
      error: 'businessId es obligatorio (alfanumérico, 3-50 caracteres)',
    });
  }

  const trimmedId = businessId.trim();

  // Registrar propiedad del businessId (o verificar que ya es del usuario)
  try {
    await claimBusiness(trimmedId, req.user.id, name || null);
  } catch (err) {
    if (err.message === 'BUSINESS_TAKEN') {
      return res.status(403).json({
        error: 'Este businessId ya está registrado por otro usuario.',
      });
    }
    console.error('❌ Error al registrar business:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }

  try {
    const result = await whatsappManager.initSession(trimmedId);

    await logAudit({
      userId: req.user.id,
      action: 'session.init',
      resource: trimmedId,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /qr/:businessId — Obtener código QR en base64
 * Solo accesible si el businessId pertenece al usuario autenticado.
 */
router.get('/qr/:businessId', async (req, res) => {
  const { businessId } = req.params;

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  // Verificar propiedad
  const ownership = await requireOwnership(businessId, req.user.id, res);
  if (!ownership) return;

  const qr = whatsappManager.getQR(businessId);

  if (!qr) {
    const status = await whatsappManager.getSessionStatus(businessId);

    let hint = 'Espera un momento, el QR se está generando';
    if (status === 'connected') {
      hint = 'La sesión ya está conectada, no necesita QR';
    } else if (status === 'not_found') {
      hint = 'No hay sesión activa. Usa POST /init primero';
    }

    return res.status(404).json({
      error: 'QR no disponible',
      sessionStatus: status,
      hint,
    });
  }

  res.json({ qr });
});

/**
 * POST /send — Enviar mensaje de texto
 * Body: { "businessId": "mi-negocio", "to": "5491112345678", "message": "Hola!" }
 * Solo accesible si el businessId pertenece al usuario autenticado.
 */
router.post('/send', async (req, res) => {
  const { businessId, to, message } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  // Verificar propiedad
  const ownership = await requireOwnership(businessId.trim(), req.user.id, res);
  if (!ownership) return;

  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'Campo "to" es obligatorio' });
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "message" es obligatorio' });
  }

  if (message.length > 4096) {
    return res
      .status(400)
      .json({ error: 'El mensaje no puede superar 4096 caracteres' });
  }

  try {
    const response = await whatsappManager.sendMessage(
      businessId.trim(),
      to.trim(),
      message.trim(),
    );

    await logAudit({
      userId: req.user.id,
      action: 'message.send',
      resource: businessId.trim(),
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
      metadata: { to: to.trim() },
    });

    res.json({ success: true, data: response });
  } catch (err) {
    const status = err.message.includes('no encontrada') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /send-message — Enviar mensaje usando cualquier sesión conectada DEL USUARIO
 * No requiere especificar businessId; el sistema elige una sesión disponible
 * que pertenezca al usuario autenticado (nunca usa sesiones de otros).
 * Body: { "to": "5491112345678", "message": "Hola!" }
 */
router.post('/send-message', async (req, res) => {
  const { to, message } = req.body || {};

  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'Campo "to" es obligatorio' });
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "message" es obligatorio' });
  }

  if (message.length > 4096) {
    return res
      .status(400)
      .json({ error: 'El mensaje no puede superar 4096 caracteres' });
  }

  try {
    // Solo usar sesiones que pertenezcan a este usuario
    const userBusinessIds = await getUserBusinessIds(req.user.id);

    if (userBusinessIds.length === 0) {
      return res.status(503).json({
        error:
          'No tienes negocios registrados. Usa POST /init para crear una sesión primero.',
      });
    }

    const response = await whatsappManager.sendMessageForUser(
      to.trim(),
      message.trim(),
      userBusinessIds,
    );

    await logAudit({
      userId: req.user.id,
      action: 'message.send_any',
      resource: null,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
      metadata: { to: to.trim() },
    });

    res.json({ success: true, data: response });
  } catch (err) {
    const status = err.message.includes('No hay sesiones') ? 503 : 400;
    res.status(status).json({ error: err.message });
  }
});

/**
 * GET /status/:businessId — Estado de conexión de una sesión
 * Solo accesible si el businessId pertenece al usuario autenticado.
 */
router.get('/status/:businessId', async (req, res) => {
  const { businessId } = req.params;

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  // Verificar propiedad
  const ownership = await requireOwnership(businessId, req.user.id, res);
  if (!ownership) return;

  try {
    const connected = await whatsappManager.isConnected(businessId);
    const status = await whatsappManager.getSessionStatus(businessId);

    res.json({
      businessId,
      connected,
      status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /sessions — Listar sesiones activas DEL USUARIO
 * Solo retorna las sesiones que pertenecen al usuario autenticado.
 */
router.get('/sessions', async (req, res) => {
  try {
    const userBusinessIds = await getUserBusinessIds(req.user.id);
    const sessions = await whatsappManager.listSessionsForUser(userBusinessIds);
    res.json({ count: sessions.length, sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /logout — Cerrar y destruir una sesión
 * Body: { "businessId": "mi-negocio" }
 * Solo accesible si el businessId pertenece al usuario autenticado.
 */
router.post('/logout', async (req, res) => {
  const { businessId } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  // Verificar propiedad
  const ownership = await requireOwnership(businessId.trim(), req.user.id, res);
  if (!ownership) return;

  try {
    const result = await whatsappManager.logout(businessId.trim());

    await logAudit({
      userId: req.user.id,
      action: 'session.logout',
      resource: businessId.trim(),
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /restart — Reiniciar una sesión
 * Body: { "businessId": "mi-negocio" }
 * Solo accesible si el businessId pertenece al usuario autenticado.
 */
router.post('/restart', async (req, res) => {
  const { businessId } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  // Verificar propiedad
  const ownership = await requireOwnership(businessId.trim(), req.user.id, res);
  if (!ownership) return;

  try {
    const result = await whatsappManager.restart(businessId.trim());

    await logAudit({
      userId: req.user.id,
      action: 'session.restart',
      resource: businessId.trim(),
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /businesses — Listar negocios registrados del usuario
 * Retorna todos los businessIds registrados por el usuario con estado de sesión.
 */
router.get('/businesses', async (req, res) => {
  try {
    const businesses = await getUserBusinesses(req.user.id);

    // Enriquecer con estado de sesión actual
    const enriched = await Promise.all(
      businesses.map(async (b) => {
        const status = await whatsappManager.getSessionStatus(b.businessId);
        const connected = await whatsappManager.isConnected(b.businessId);
        return {
          businessId: b.businessId,
          name: b.name,
          createdAt: b.createdAt,
          sessionStatus: status,
          connected,
        };
      }),
    );

    res.json({ count: enriched.length, businesses: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /businesses/:businessId — Eliminar (desactivar) un negocio
 * También cierra la sesión de WhatsApp si existe.
 * Solo accesible si el businessId pertenece al usuario autenticado.
 */
router.delete('/businesses/:businessId', async (req, res) => {
  const { businessId } = req.params;

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  // Verificar propiedad
  const ownership = await requireOwnership(businessId, req.user.id, res);
  if (!ownership) return;

  try {
    // Cerrar sesión de WhatsApp si existe
    try {
      await whatsappManager.logout(businessId);
    } catch {
      // Ignorar si la sesión no existe
    }

    // Desactivar el business (soft-delete)
    await deactivateBusiness(businessId, req.user.id);

    await logAudit({
      userId: req.user.id,
      action: 'business.delete',
      resource: businessId,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: `Business "${businessId}" eliminado exitosamente` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
