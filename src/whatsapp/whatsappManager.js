import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';

const { Client, LocalAuth } = pkg;

class WhatsAppManager {
  constructor() {
    this.clients = new Map(); // businessId → client
    this.qrCodes = new Map(); // businessId → qr base64
    this.initializing = new Set(); // businessIds en proceso de init (evitar race conditions)
  }

  /**
   * Inicializa una sesión de WhatsApp para un negocio.
   * Protege contra inicializaciones duplicadas simultáneas.
   */
  async initSession(businessId) {
    // Sesión ya activa
    if (this.clients.has(businessId)) {
      const client = this.clients.get(businessId);
      return {
        message: 'La sesión ya existe',
        status: client.info ? 'connected' : 'waiting_qr',
      };
    }

    // Protección contra race conditions
    if (this.initializing.has(businessId)) {
      return { message: 'La sesión se está inicializando, espera un momento' };
    }

    this.initializing.add(businessId);

    try {
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: businessId,
          dataPath: './sessions',
        }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      });

      // ─── Eventos ────────────────────────────────────
      client.on('qr', async (qr) => {
        try {
          const qrImage = await qrcode.toDataURL(qr);
          this.qrCodes.set(businessId, qrImage);
          console.log(`📲 QR generado para ${businessId}`);
        } catch (err) {
          console.error(
            `❌ Error generando QR para ${businessId}:`,
            err.message,
          );
        }
      });

      client.on('ready', () => {
        console.log(`✅ WhatsApp listo para ${businessId}`);
        this.qrCodes.delete(businessId);
      });

      client.on('authenticated', () => {
        console.log(`🔐 Autenticado: ${businessId}`);
      });

      client.on('auth_failure', (msg) => {
        console.error(`🚫 Fallo de autenticación para ${businessId}:`, msg);
        this._cleanup(businessId);
      });

      client.on('change_state', (state) => {
        console.log(`🔄 Estado cambiado para ${businessId}: ${state}`);
      });

      client.on('disconnected', (reason) => {
        console.log(`❌ Desconectado ${businessId}: ${reason}`);
        this._cleanup(businessId);
      });

      client.on('error', (err) => {
        console.error(`💥 Error en cliente ${businessId}:`, err.message);
      });

      await client.initialize();
      this.clients.set(businessId, client);

      return { message: 'Sesión inicializada correctamente' };
    } catch (err) {
      console.error(
        `❌ Error inicializando sesión ${businessId}:`,
        err.message,
      );
      this.initializing.delete(businessId);
      throw new Error(`No se pudo inicializar la sesión: ${err.message}`);
    } finally {
      this.initializing.delete(businessId);
    }
  }

  /**
   * Obtiene el QR en base64 para una sesión.
   */
  getQR(businessId) {
    return this.qrCodes.get(businessId) || null;
  }

  /**
   * Verifica si un negocio tiene sesión activa y conectada.
   * Consulta el estado real de WhatsApp (no solo la caché en memoria).
   */
  async isConnected(businessId) {
    const client = this.clients.get(businessId);
    if (!client) return false;

    try {
      const state = await client.getState();
      return state === 'CONNECTED';
    } catch {
      return false;
    }
  }

  /**
   * Devuelve el estado detallado de una sesión.
   * Consulta el estado real de la conexión WebSocket.
   */
  async getSessionStatus(businessId) {
    if (this.initializing.has(businessId)) {
      return 'initializing';
    }

    const client = this.clients.get(businessId);

    if (!client) return 'not_found';

    try {
      const state = await client.getState();
      // Estados posibles: CONNECTED, OPENING, PAIRING, TIMEOUT, CONFLICT, etc.
      if (state === 'CONNECTED') return 'connected';
      if (state === 'OPENING') return 'connecting';
      if (state === 'PAIRING') return 'waiting_qr';
      return state?.toLowerCase() || 'disconnected';
    } catch {
      // Si getState() falla, el cliente no está activo
      if (this.qrCodes.has(businessId)) return 'waiting_qr';
      return 'disconnected';
    }
  }

  /**
   * Envía un mensaje de texto a un número.
   * @param {string} businessId - ID del negocio
   * @param {string} to - Número de teléfono (con código de país, sin +)
   * @param {string} message - Texto del mensaje
   */
  async sendMessage(businessId, to, message) {
    const client = this.clients.get(businessId);

    if (!client) {
      throw new Error('Sesión no encontrada. Inicia una sesión primero.');
    }

    try {
      const state = await client.getState();
      if (state !== 'CONNECTED') {
        throw new Error(
          `El cliente no está conectado (estado: ${state}). Escanea el QR primero.`,
        );
      }
    } catch (err) {
      if (err.message.includes('no está conectado')) throw err;
      throw new Error('El cliente aún no está listo. Escanea el QR primero.');
    }

    // Limpiar el número: quitar +, espacios, guiones
    const cleaned = to.replaceAll(/[\s+\-()]/g, '');

    if (!/^\d{10,15}$/.test(cleaned)) {
      throw new Error(
        'Número de teléfono inválido. Usa código de país + número (ej: 5491112345678)',
      );
    }

    const chatId = `${cleaned}@c.us`;
    const result = await client.sendMessage(chatId, message);

    return {
      id: result.id?.id,
      to: chatId,
      timestamp: result.timestamp,
    };
  }

  /**
   * Lista todos los negocios con sesión activa.
   */
  async listSessions() {
    const sessions = [];
    for (const [businessId] of this.clients) {
      const status = await this.getSessionStatus(businessId);
      sessions.push({
        businessId,
        status,
        hasQR: this.qrCodes.has(businessId),
      });
    }
    return sessions;
  }

  /**
   * Cierra y destruye la sesión de un negocio.
   */
  async logout(businessId) {
    const client = this.clients.get(businessId);

    if (!client) {
      throw new Error('Sesión no encontrada');
    }

    try {
      await client.logout();
    } catch {
      // Si ya está desconectado, ignorar
    }

    try {
      await client.destroy();
    } catch {
      // Ignorar errores al destruir
    }

    this._cleanup(businessId);
    console.log(`🗑️ Sesión cerrada para ${businessId}`);

    return { message: 'Sesión cerrada correctamente' };
  }

  /**
   * Reinicia una sesión (logout + init).
   */
  async restart(businessId) {
    try {
      await this.logout(businessId);
    } catch {
      // Si no existía, continuar
    }

    return await this.initSession(businessId);
  }

  /**
   * Destruye todas las sesiones (para graceful shutdown).
   */
  async destroyAll() {
    const promises = [];

    for (const [businessId, client] of this.clients) {
      console.log(`🔄 Cerrando sesión ${businessId}...`);
      promises.push(
        client.destroy().catch((err) => {
          console.error(`Error cerrando ${businessId}:`, err.message);
        }),
      );
    }

    await Promise.allSettled(promises);
    this.clients.clear();
    this.qrCodes.clear();
    this.initializing.clear();
  }

  /**
   * Limpieza interna de maps al desconectar/fallar.
   */
  _cleanup(businessId) {
    this.clients.delete(businessId);
    this.qrCodes.delete(businessId);
    this.initializing.delete(businessId);
  }
}

export default new WhatsAppManager();
