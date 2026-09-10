// ============================================================================
//  clearance.js — Clearance seviye 1-5 gosterim yardimcilari (Issue #102).
//  Etiketler i18n'de ('clearance.l1'..'clearance.l5'); backend 1..5 disini
//  reddeder (bkz. backend/src/constants.js isValidClearanceLevel).
// ============================================================================

export const MIN_CLEARANCE_LEVEL = 1
export const MAX_CLEARANCE_LEVEL = 5

/** Sabit 1-5 araligi (IBM DOORS/Polarion yerine savunma projeleri standardi). */
export const CLEARANCE_LEVELS = [1, 2, 3, 4, 5]

/** Seviye icin i18n anahtari: 3 -> 'clearance.l3' */
export function clearanceLabelKey(level) {
  const n = Number(level)
  return CLEARANCE_LEVELS.includes(n) ? `clearance.l${n}` : null
}

/** Ornek cikti: "5 — Çok Gizli" / "3 — Confidential". */
export function clearanceDisplay(level, t) {
  const n = Number(level)
  const key = clearanceLabelKey(n)
  if (!key || typeof t !== 'function') return String(n)
  return `${n} — ${t(key)}`
}

/** Gecerli clearance seviyesi mi? (frontend form tarafi) */
export function isValidClearanceLevel(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= MIN_CLEARANCE_LEVEL && n <= MAX_CLEARANCE_LEVEL
}
