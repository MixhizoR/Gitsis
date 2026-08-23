// ============================================================================
//  bootstrap.js  —  Ilk acilista (ve "Demo Sifirla"da) veri tabanini hazirlar.
//  Sunucudaki db.json zaten doluysa hicbir sey yapilmaz; bossa demo (seed)
//  verisi yuklenir. force=true ile mevcut veri silinip resmi seed yeniden kurulur.
// ============================================================================
import { db, COLLECTIONS } from './db.js'
import { SEED_REQUIREMENTS, SEED_LINKS, SEED_AUDIT } from './seedData.js'
import { recomputeStatuses } from '../utils/coverage.js'

/**
 * Veri tabanini gerekiyorsa tohumlar (seed).
 * @param {boolean} force  true ise mevcut veriyi silip demo veriyi yeniden yukler.
 * @returns {Promise<boolean>} tohumlama yapildiysa true.
 */
export async function ensureSeeded(force = false) {
  const hasData = await db.exists(COLLECTIONS.REQUIREMENTS)
  if (hasData && !force) return false

  // Resmi seed durumlarini otomatik-durum kurallarina gore tutarli hale getir.
  const { next: seededRequirements } = recomputeStatuses(SEED_REQUIREMENTS, SEED_LINKS)

  await db.write(COLLECTIONS.REQUIREMENTS, seededRequirements)
  await db.write(COLLECTIONS.LINKS, SEED_LINKS)
  await db.write(COLLECTIONS.AUDIT, SEED_AUDIT)
  await db.write(COLLECTIONS.RETIRED, []) // kara liste temizlenir
  return true
}
