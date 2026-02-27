import express from 'express';
import whatsappManager from '../whatsapp/whatsappManager.js';

const router = express.Router();

// ─── Validador de businessId ─────────────────────────────
const validateBusinessId = (businessId) => {
  if (!businessId || typeof businessId !== 'string') return false;
  // Solo alfanumérico, guiones y guiones bajos, 3-50 caracteres
  return /^[a-zA-Z0-9_-]{3,50}$/.test(businessId.trim());
};

/**
 * POST /init — Iniciar sesión de WhatsApp
 * Body: { "businessId": "mi-negocio" }
 */
router.post('/init', async (req, res) => {
  const { businessId } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({
      error: 'businessId es obligatorio (alfanumérico, 3-50 caracteres)',
    });
  }

  try {
    const result = await whatsappManager.initSession(businessId.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /qr/:businessId — Obtener código QR en base64
 */
router.get('/qr/:businessId', async (req, res) => {
  const { businessId } = req.params;

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

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
 */
router.post('/send', async (req, res) => {
  const { businessId, to, message } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

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
    res.json({ success: true, data: response });
  } catch (err) {
    const status = err.message.includes('no encontrada') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

/**
 * GET /status/:businessId — Estado de conexión de una sesión
 */
router.get('/status/:businessId', async (req, res) => {
  const { businessId } = req.params;

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

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
 * GET /sessions — Listar todas las sesiones activas
 */
router.get('/sessions', async (_req, res) => {
  try {
    const sessions = await whatsappManager.listSessions();
    res.json({ count: sessions.length, sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /logout — Cerrar y destruir una sesión
 * Body: { "businessId": "mi-negocio" }
 */
router.post('/logout', async (req, res) => {
  const { businessId } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  try {
    const result = await whatsappManager.logout(businessId.trim());
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /restart — Reiniciar una sesión
 * Body: { "businessId": "mi-negocio" }
 */
router.post('/restart', async (req, res) => {
  const { businessId } = req.body || {};

  if (!validateBusinessId(businessId)) {
    return res.status(400).json({ error: 'businessId inválido' });
  }

  try {
    const result = await whatsappManager.restart(businessId.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
