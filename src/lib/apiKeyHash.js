import crypto from 'crypto';

// ─── Hashing (one-way, for auth lookups) ─────────────────

/**
 * Genera un hash SHA-256 de una API Key.
 * Se usa para almacenar y comparar claves de forma segura.
 *
 * @param {string} apiKey - La API Key en texto plano
 * @returns {string} Hash SHA-256 en formato hexadecimal
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Extrae los últimos 8 caracteres de una API Key para mostrar como hint.
 *
 * @param {string} apiKey - La API Key en texto plano
 * @returns {string} Los últimos 8 caracteres precedidos por "..."
 */
export function getKeyHint(apiKey) {
  return `...${apiKey.slice(-8)}`;
}

// ─── Encryption (reversible, for user display) ───────────

const ALGORITHM = 'aes-256-gcm';

/**
 * Obtiene la clave de encriptación de 32 bytes.
 * Usa API_KEY_ENCRYPTION_SECRET del env, o deriva una clave por defecto
 * a partir de CLERK_SECRET_KEY (solo para desarrollo).
 */
function getEncryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (secret) {
    // Si es hex de 64 chars (32 bytes), usar directamente
    if (/^[0-9a-f]{64}$/i.test(secret)) {
      return Buffer.from(secret, 'hex');
    }
    // Sino, derivar 32 bytes con SHA-256
    return crypto.createHash('sha256').update(secret).digest();
  }

  // Fallback para desarrollo: derivar de CLERK_SECRET_KEY
  const fallback =
    process.env.CLERK_SECRET_KEY || 'whatsapp-service-dev-default';
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️  API_KEY_ENCRYPTION_SECRET no configurado. Configuralo para producción.',
    );
  }
  return crypto.createHash('sha256').update(fallback).digest();
}

/**
 * Encripta una API Key con AES-256-GCM.
 * Retorna un string con formato: iv:authTag:ciphertext (todo en hex).
 *
 * @param {string} plaintext - La API Key en texto plano
 * @returns {string} Datos encriptados
 */
export function encryptApiKey(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Desencripta una API Key previamente encriptada con encryptApiKey().
 *
 * @param {string} encryptedData - Formato iv:authTag:ciphertext
 * @returns {string} API Key en texto plano
 */
export function decryptApiKey(encryptedData) {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
