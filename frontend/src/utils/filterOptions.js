// ============================================================================
//  filterOptions.js  —  Ortak filtre cubugunun (FilterBar) secenek uretimi.
//  Uc sayfa (Hiyerarsi / Test Senaryolari / Urun Agaci) ayni listeleri
//  turettigi icin tek kaynakta toplanir.
// ============================================================================
import { STATUSES } from './constants.js'
import { VERIFICATION, VERIFICATION_ORDER, VERIFICATION_LABEL_KEY } from './verification.js'

/**
 * Filtrelenebilir modular oznitelikler: varliga uyan TUM tanimlar.
 *
 * Eskiden yalnizca 'select' tipindekiler donuyordu; bu yuzden projeye
 * eklenen bir metin/sayi/tarih ozniteligi (orn. "Risk Skoru") filtre
 * menusunde HIC gorunmuyordu. Artik her tip icin uygun girdi uretilir
 * (bkz. FilterBar attrControl + useEntityFilters attrMatches). Seceneksiz
 * bir 'select' tanimi ise disarida kalir — secilecek bir sey yoktur.
 *
 * Siralama EntityTable sutun sirasiyla ayni olsun diye `order` ile yapilir.
 */
export function filterableAttrDefs(attributeDefs, entityType) {
  return (attributeDefs || [])
    .filter((d) => d.entityType === entityType || d.entityType === 'both')
    .filter((d) => d.dataType !== 'select' || (d.options || []).length > 0)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

// Gereksinim sayfalari (Issue #105): DURUM sutunu kaydin kendi onayindan
// degil, onu DOGRULAYAN test senaryolarindan turetilir. Filtre secenekleri
// tablodaki rozetlerin BIREBIR karsiligidir: Doğrulanamaz / Doğrulanmayı
// Bekliyor / Doğrulandı / Doğrulama Başarısız (bkz. utils/verification.js).
export function requirementStatusOptions(t) {
  return VERIFICATION_ORDER.map((state) => ({
    value: state,
    label: t(VERIFICATION_LABEL_KEY[state]),
  }))
}

/**
 * Gereksinim satirinin DURUM sutununda gorunen deger (filtre karsilastirmasi
 * da bunu kullanir — gorunen ile filtrelenen hep ayni kalir).
 * @param {object} row
 * @param {(row)=>object} verificationFor  buildVerificationIndex ozeti dondurur
 */
export function requirementStatusOf(row, verificationFor) {
  return verificationFor(row)?.state || VERIFICATION.UNVERIFIABLE
}

// Test sayfalari: durum dogrudan test SONUCUDUR (Approved = Passed,
// Rejected = Failed) — backend cascade'i yazar, "dogrulanamaz" hali yoktur.
export function testStatusOptions() {
  return STATUSES.map((s) => ({ value: s, label: s }))
}
