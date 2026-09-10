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

/** Personel kaydinin gorunen adi ("Ad Soyad"). */
export function personnelName(p) {
  if (!p) return ''
  return `${p.firstName || ''} ${p.lastName || ''}`.trim()
}

/** Bir metni belirli uzunlukta keser. */
export function truncate(text, max = 90) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
}

/** HTML etiketlerini soker, duz metne cevirir (zengin metin onizlemeleri icin). */
export function stripHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Baslik yoksa aciklamadan turetilen etiketin ust siniri — normal baslik
// aliskanligindan (~30-50 karakter) belirgin sekilde daha genis: baslik
// olmayan bir kaydin TEK gorunur bilgisi bu oldugu icin listelerde/agacta
// fazladan kesilmemesi onemli.
const FALLBACK_LABEL_MAX = 220

/**
 * Baslik ARTIK ZORUNLU DEGIL (Requirement/TestCase.title bos olabilir).
 * Bir satirin goruntulenecek etiketini TEK YERDEN belirler:
 *   1) baslik varsa o (isFallback:false),
 *   2) yoksa aciklamadan (HTML'den arindirilmis, kesilmis) turetilmis metin
 *      (isFallback:true — cagiran taraf bunu KALIN + ORTALANMIS gostermeli),
 *   3) o da yoksa sozluk terimi (`term`) ya da text_id (isFallback:false).
 * Import/olusturma akislarinin ARTIK baslik UYDURMAMASI (bkz. reqifParser.js)
 * bu fonksiyonu UI'daki TEK "baslik yoksa ne gosterilir" karar noktasi yapar.
 */
export function getDisplayLabel(row, { max = FALLBACK_LABEL_MAX } = {}) {
  const title = String(row?.title || '').trim()
  if (title) return { text: title, isFallback: false }
  const plain = stripHtml(row?.description || '')
  if (plain) return { text: truncate(plain, max), isFallback: true }
  if (row?.term) return { text: row.term, isFallback: false }
  return { text: row?.text_id || '', isFallback: false }
}

/**
 * "5 dk once", "2 saat once" gibi goreli zaman.
 * Yorum listesinde okunabilirlik icin kullanilir; 7 gunden eskiler tam
 * tarihe duser (goreli ifade orada anlamini yitirir).
 */
export function formatRelativeTime(iso, now = Date.now()) {
  if (!iso) return '-'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return String(iso)
  const sec = Math.round((now - t) / 1000)
  if (sec < 0) return formatDateTime(iso) // gelecek tarih: goreli ifade sasirtir
  if (sec < 60) return 'az önce'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} dk önce`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} saat önce`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day} gün önce`
  return formatDateTime(iso)
}
