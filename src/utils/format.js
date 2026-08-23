// ============================================================================
//  format.js  —  Kucuk bicimlendirme yardimcilari.
// ============================================================================

/** ISO tarihi okunakli Turkce tarih-saate cevirir. */
export function formatDateTime(iso) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Yalnizca tarih. */
export function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/** Bir metni belirli uzunlukta keser. */
export function truncate(text, max = 90) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
}
