// ============================================================================
//  filterOptions.js  —  Ortak filtre cubugunun (FilterBar) secenek uretimi.
//  Uc sayfa (Hiyerarsi / Test Senaryolari / Urun Agaci) ayni listeleri
//  turettigi icin tek kaynakta toplanir.
// ============================================================================
import { STATUSES } from './constants.js'
import { UNVERIFIABLE } from '../hooks/useEntityFilters.js'

/**
 * Filtrelenebilir modular oznitelikler: yalnizca SELECT tipindekiler — serbest
 * metin/sayi/tarih alanlari icin sabit bir secenek listesi cikarilamaz.
 * Siralama EntityTable sutun sirasiyla ayni olsun diye `order` ile yapilir.
 */
export function selectAttrDefs(attributeDefs, entityType) {
  return (attributeDefs || [])
    .filter((d) => d.entityType === entityType || d.entityType === 'both')
    .filter((d) => d.dataType === 'select' && (d.options || []).length > 0)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

// Gereksinim sayfalari: DURUM sutunu kaydin kendi onayindan degil, onu
// DOGRULAYAN test senaryosundan turetilir; bagli test yoksa "Dogrulanamaz"
// gorunur. Filtre secenekleri de bu gorunumu birebir karsilar.
export function requirementStatusOptions(t) {
  return [
    { value: UNVERIFIABLE, label: t('tbl.unverifiable') },
    ...STATUSES.map((s) => ({ value: s, label: s })),
  ]
}

/** Gereksinim satirinin DURUM sutununda gorunen deger. */
export function requirementStatusOf(row, verifiedFor) {
  return verifiedFor(row) ? row.status : UNVERIFIABLE
}

// Test sayfalari: durum dogrudan test SONUCUDUR (Approved = Passed,
// Rejected = Failed) — backend cascade'i yazar, "dogrulanamaz" hali yoktur.
export function testStatusOptions() {
  return STATUSES.map((s) => ({ value: s, label: s }))
}
