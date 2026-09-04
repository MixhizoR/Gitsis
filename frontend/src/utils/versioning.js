// ============================================================================
//  versioning.js  —  Issue #57: versiyon gecmisi yardimcilari (saf).
//  Backend, her ICERIK degisiminde degisiklik ONCESI durumu RequirementHistory
//  tablosuna yazar (SCD Type 4). Bu modul, ardışık snapshot'lari karsilastirip
//  UI'da gosterilecek "degisen alanlar" ozetini cikarir. Yalnizca tetikleyici
//  icerik alanlari ozetlenir (status/approvalStatus/locked gibi otomatik
//  alanlar tarihce satirini gurultuye bogmasin).
// ============================================================================

// Backend CONTENT_TRIGGER_FIELDS + ATTRIBUTE_TRIGGER_KEYS ile ayni olmali.
export const HISTORY_DIFF_FIELDS = ['title', 'description', 'field']
export const HISTORY_DIFF_ATTRIBUTE_KEYS = ['priority', 'dal_level']

/**
 * Iki snapshot arasinda DEGISEN icerik alanlarinin anahtar listesini dondurur.
 * `older` ve `newer` RequirementHistory satiri veya ana tablo satiri olabilir
 * (attributes JSONB + top-level alanlar ayni sekilde okunur).
 *
 * @param {object|null} older
 * @param {object|null} newer
 * @returns {string[]} orn. ['title', 'priority']
 */
export function changedFieldsSummary(older, newer) {
  const changed = []
  if (!older || !newer) return changed
  for (const field of HISTORY_DIFF_FIELDS) {
    if (String(older[field] ?? '') !== String(newer[field] ?? '')) changed.push(field)
  }
  const oa = older.attributes || {}
  const na = newer.attributes || {}
  for (const key of HISTORY_DIFF_ATTRIBUTE_KEYS) {
    if (String(oa[key] ?? '') !== String(na[key] ?? '')) changed.push(key)
  }
  return changed
}
