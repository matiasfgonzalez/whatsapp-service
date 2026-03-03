import prisma from './prisma.js';

/**
 * Verifica que un businessId pertenezca al usuario autenticado.
 * Si el businessId no existe en la DB, retorna null (no registrado).
 * Si existe y pertenece a otro usuario, retorna { forbidden: true }.
 * Si existe y pertenece al usuario, retorna el registro del business.
 *
 * @param {string} businessId - El ID del negocio
 * @param {string} userId - El ID del usuario autenticado (req.user.id)
 * @returns {Object|null} El registro del business, null si no existe, o { forbidden: true }
 */
export async function verifyOwnership(businessId, userId) {
  const business = await prisma.business.findUnique({
    where: { businessId },
  });

  if (!business) return null; // No registrado aún

  if (business.userId !== userId) {
    return { forbidden: true };
  }

  if (!business.active) {
    return { inactive: true };
  }

  return business;
}

/**
 * Registra un businessId como propiedad de un usuario.
 * Lanza error si el businessId ya está registrado por otro usuario.
 *
 * Utiliza un patrón "insert-first" para evitar race conditions:
 * en vez de findUnique + create (no atómico), intenta crear directamente
 * y captura el unique constraint violation (P2002) si otro request ganó.
 *
 * @param {string} businessId - El ID del negocio
 * @param {string} userId - El ID del usuario
 * @param {string} [name] - Nombre descriptivo opcional
 * @returns {Object} El registro del business creado o existente
 */
export async function claimBusiness(businessId, userId, name = null) {
  // Intento 1: crear directamente (atómico gracias al unique constraint)
  try {
    return await prisma.business.create({
      data: { businessId, userId, name },
    });
  } catch (err) {
    // Si NO es un unique constraint violation, propagar el error
    if (err.code !== 'P2002') {
      throw err;
    }
    // El businessId ya existe → caemos al flujo de verificación
  }

  // Si llegamos aquí, el businessId ya existe en la DB.
  // Leer el registro existente y verificar propiedad.
  const existing = await prisma.business.findUnique({
    where: { businessId },
  });

  if (!existing) {
    // Caso extremo: fue eliminado entre el create y el findUnique
    // Re-intentar creación una vez
    return prisma.business.create({
      data: { businessId, userId, name },
    });
  }

  if (existing.userId !== userId) {
    throw new Error('BUSINESS_TAKEN');
  }

  // Si estaba inactivo, reactivar
  if (!existing.active) {
    return prisma.business.update({
      where: { businessId },
      data: { active: true, name: name || existing.name },
    });
  }

  return existing;
}

/**
 * Obtiene todos los businessIds activos que pertenecen a un usuario.
 *
 * @param {string} userId - El ID del usuario
 * @returns {string[]} Array de businessIds
 */
export async function getUserBusinessIds(userId) {
  const businesses = await prisma.business.findMany({
    where: { userId, active: true },
    select: { businessId: true },
  });

  return businesses.map((b) => b.businessId);
}

/**
 * Obtiene todos los negocios activos de un usuario con detalles.
 *
 * @param {string} userId - El ID del usuario
 * @returns {Object[]} Array de registros de business
 */
export async function getUserBusinesses(userId) {
  return prisma.business.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Desactiva (soft-delete) un business. No elimina el registro
 * para mantener historial, pero lo marca como inactivo.
 *
 * @param {string} businessId - El ID del negocio
 * @param {string} userId - El ID del usuario (para verificar propiedad)
 * @returns {Object} El registro actualizado
 */
export async function deactivateBusiness(businessId, userId) {
  const existing = await prisma.business.findUnique({
    where: { businessId },
  });

  if (!existing) {
    throw new Error('BUSINESS_NOT_FOUND');
  }

  if (existing.userId !== userId) {
    throw new Error('BUSINESS_TAKEN');
  }

  return prisma.business.update({
    where: { businessId },
    data: { active: false },
  });
}
