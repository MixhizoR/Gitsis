// ============================================================================
//  verification.js  —  Issue #105: Gereksinim DOGRULAMA durumu.
//
//  Bir gereksinim KENDI basina onaylanmaz; "dogrulanmis" sayilmasi tamamen onu
//  DOGRULAYAN (Verifies) test senaryolarinin sonucundan turetilir (backend
//  cascade ayni kurali uygular — bkz. backend/src/cascade.js). Bu modul o
//  turetmeyi TEK KAYNAKTAN, dort ayri ve okunabilir duruma ayirir:
//
//    unverifiable  Hicbir test senaryosu bagli degil  -> "Doğrulanamaz"
//    pending       Bagli test var, sonuc bekleniyor   -> "Doğrulanmayı Bekliyor"
//    verified      Tum bagli testler onayli (gecti)   -> "Doğrulandı"
//    failed        En az bir bagli test reddedildi    -> "Doğrulama Başarısız"
//
//  Eskiden tabloda yalnizca "Doğrulanamaz" ile ham `r.status` (In Review /
//  Approved / Rejected) gorunuyordu; bu, "beklemede" ile "gercekten
//  dogrulandi" ayrimini kullanici tarafinda belirsiz birakiyordu.
//
//  Saf (pure) fonksiyonlar: yan etki yok, kolay test edilir.
// ============================================================================
import { LINK_TYPE, STATUS } from './constants.js'

export const VERIFICATION = {
  UNVERIFIABLE: 'unverifiable',
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
}

/** Filtre / rozet siralamasi: en kotuden en iyiye (kullanici once acigi gorsun). */
export const VERIFICATION_ORDER = [
  VERIFICATION.UNVERIFIABLE,
  VERIFICATION.FAILED,
  VERIFICATION.PENDING,
  VERIFICATION.VERIFIED,
]

/** Rozet stilleri (StatusBadge ile ayni Tailwind sozlesmesi). */
export const VERIFICATION_STYLES = {
  [VERIFICATION.UNVERIFIABLE]:
    'bg-slate-100 text-slate-500 ring-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
  [VERIFICATION.PENDING]:
    'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60',
  [VERIFICATION.VERIFIED]:
    'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800/60',
  [VERIFICATION.FAILED]:
    'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60',
}

/** Dagilim cubugu (Dashboard BreakdownBar) renkleri. */
export const VERIFICATION_BAR = {
  [VERIFICATION.UNVERIFIABLE]: 'bg-slate-400',
  [VERIFICATION.PENDING]: 'bg-amber-500',
  [VERIFICATION.VERIFIED]: 'bg-emerald-500',
  [VERIFICATION.FAILED]: 'bg-rose-500',
}

/** i18n anahtarlari — etiket ve aciklama (tooltip) icin. */
export const VERIFICATION_LABEL_KEY = {
  [VERIFICATION.UNVERIFIABLE]: 'ver.unverifiable',
  [VERIFICATION.PENDING]: 'ver.pending',
  [VERIFICATION.VERIFIED]: 'ver.verified',
  [VERIFICATION.FAILED]: 'ver.failed',
}
export const VERIFICATION_HINT_KEY = {
  [VERIFICATION.UNVERIFIABLE]: 'ver.unverifiable.hint',
  [VERIFICATION.PENDING]: 'ver.pending.hint',
  [VERIFICATION.VERIFIED]: 'ver.verified.hint',
  [VERIFICATION.FAILED]: 'ver.failed.hint',
}

const EMPTY_INFO = Object.freeze({
  state: VERIFICATION.UNVERIFIABLE,
  total: 0,
  approved: 0,
  rejected: 0,
  pending: 0,
  tests: [],
})

/** Bos (hicbir test bagli olmayan) dogrulama ozeti. */
export function emptyVerification() {
  return EMPTY_INFO
}

/**
 * Bagli test listesinden durumu turetir. Sira onemlidir: bir RED, bekleyen
 * testler olsa bile sonucu "basarisiz" yapar (cascade ile ayni oncelik).
 */
function stateOf({ total, approved, rejected }) {
  if (total === 0) return VERIFICATION.UNVERIFIABLE
  if (rejected > 0) return VERIFICATION.FAILED
  if (approved === total) return VERIFICATION.VERIFIED
  return VERIFICATION.PENDING
}

/**
 * Proje genelinde gereksinim -> dogrulama ozeti indeksi kurar.
 * Tek gecis (O(bag + test)) — satir basina filtreleme yapilmaz.
 *
 * @param {Array} links      Tum izlenebilirlik baglari
 * @param {Array} testCases  Proje test senaryolari (yoksa sonuc bilinmez sayilir)
 * @returns {Map<string, {state,total,approved,rejected,pending,tests}>}
 */
export function buildVerificationIndex(links, testCases = []) {
  const testById = new Map((testCases || []).map((tc) => [tc.id, tc]))
  const index = new Map()
  for (const l of links || []) {
    if (l.type !== LINK_TYPE.VERIFIES) continue
    let info = index.get(l.fromId)
    if (!info) {
      info = {
        state: VERIFICATION.PENDING,
        total: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        tests: [],
      }
      index.set(l.fromId, info)
    }
    const tc = testById.get(l.toId)
    info.total += 1
    // Test senaryosu bu sayfada yuklu degilse sonucu BILINMEZ kabul edilir:
    // "bekleyen" sayilir, asla "dogrulandi" demez (guvenli taraf).
    if (tc?.status === STATUS.APPROVED) info.approved += 1
    else if (tc?.status === STATUS.REJECTED) info.rejected += 1
    else info.pending += 1
    info.tests.push({
      id: l.toId,
      text_id: tc?.text_id || null,
      title: tc?.title || null,
      status: tc?.status || null,
    })
  }
  for (const info of index.values()) info.state = stateOf(info)
  return index
}

/** Indeksten tek bir gereksinimin ozeti (yoksa "doğrulanamaz"). */
export function verificationOf(index, reqId) {
  return index?.get(reqId) || EMPTY_INFO
}

/**
 * Bir gereksinim kumesinin durum dagilimi — Dashboard / Kapsam raporu icin.
 * @returns {{counts:Object, total:number, verifiedScore:number}}
 *   verifiedScore: gercekten dogrulanmis gereksinim yuzdesi (0-100).
 */
export function summarizeVerification(requirements, index) {
  const counts = {
    [VERIFICATION.UNVERIFIABLE]: 0,
    [VERIFICATION.FAILED]: 0,
    [VERIFICATION.PENDING]: 0,
    [VERIFICATION.VERIFIED]: 0,
  }
  for (const r of requirements || []) counts[verificationOf(index, r.id).state] += 1
  const total = (requirements || []).length
  const verifiedScore = total === 0 ? 0 : Math.round((counts[VERIFICATION.VERIFIED] / total) * 100)
  return { counts, total, verifiedScore }
}
