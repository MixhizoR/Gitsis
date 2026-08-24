// ============================================================================
//  coverage.js  —  DO-178C kapsam (coverage) analiz mantigi.
//  Saf (pure) fonksiyonlar: gireni gereksinimler + baglar, cikani metrikler.
//  Hicbir yan etki yok -> kolayca test edilebilir.
// ============================================================================
import {
  LINK_TYPE,
  COVERABLE_TYPES,
  SATISFY_REQUIRED_TYPES,
  DAL_WEIGHT,
  REQ_TYPE,
  STATUS,
} from './constants.js'

/**
 * Bir gereksinimin "kapsanmis" sayilmasi icin en az bir Test Case'e
 * Verifies bagiyla baglanmis olmasi gerekir.
 * @returns {Set<string>} kapsanmis gereksinim id'leri
 */
export function getCoveredRequirementIds(links) {
  const covered = new Set()
  for (const l of links) {
    if (l.type === LINK_TYPE.VERIFIES) covered.add(l.fromId)
  }
  return covered
}

/**
 * Tum kapsam metriklerini hesaplar.
 * @param {Array} requirements
 * @param {Array} links
 * @returns {{
 *   total:number, coveredCount:number, uncoveredCount:number,
 *   score:number, covered:Array, uncovered:Array
 * }}
 */
export function computeCoverage(requirements, links) {
  const coverableReqs = requirements.filter((r) => COVERABLE_TYPES.includes(r.type))
  const coveredIds = getCoveredRequirementIds(links)

  const covered = []
  const uncovered = []
  for (const r of coverableReqs) {
    if (coveredIds.has(r.id)) covered.push(r)
    else uncovered.push(r)
  }

  // Kritik olanlar (DAL agirligi yuksek) en uste gelsin.
  uncovered.sort(
    (a, b) =>
      (DAL_WEIGHT[b.dal_level] || 0) - (DAL_WEIGHT[a.dal_level] || 0) ||
      a.text_id.localeCompare(b.text_id),
  )

  const total = coverableReqs.length
  const coveredCount = covered.length
  const score = total === 0 ? 0 : Math.round((coveredCount / total) * 100)

  return {
    total,
    coveredCount,
    uncoveredCount: uncovered.length,
    score,
    covered,
    uncovered,
  }
}

/**
 * SATISFY (ust izlenebilirlik) kapsami.
 *  DO-178C cift yonlu izlenebilirlik: her Sistem gereksinimi bir Kullanici
 *  gereksinimini, her Yazilim/Donanim gereksinimi bir Sistem gereksinimini
 *  karsilamalidir (Satisfies). Kullanici gereksinimleri en tepededir, ust bag
 *  gerektirmez. Bir gereksinimin "ust bagi var" sayilmasi: Satisfies bagininda
 *  COCUK (toId) olarak yer almasi.
 * @returns {{ total, satisfiedCount, openCount, score, satisfied:Array, open:Array }}
 */
export function computeSatisfyCoverage(requirements, links) {
  const needing = requirements.filter((r) => SATISFY_REQUIRED_TYPES.includes(r.type))
  const hasParent = new Set()
  for (const l of links) {
    if (l.type === LINK_TYPE.SATISFIES) hasParent.add(l.toId)
  }
  const satisfied = []
  const open = []
  for (const r of needing) {
    if (hasParent.has(r.id)) satisfied.push(r)
    else open.push(r)
  }
  open.sort(
    (a, b) =>
      (DAL_WEIGHT[b.dal_level] || 0) - (DAL_WEIGHT[a.dal_level] || 0) ||
      a.text_id.localeCompare(b.text_id),
  )
  const total = needing.length
  const score = total === 0 ? 100 : Math.round((satisfied.length / total) * 100)
  return { total, satisfiedCount: satisfied.length, openCount: open.length, score, satisfied, open }
}

/**
 * Belirli bir gereksinim icin bagli alt/ust nesneleri ozetler.
 * Gereksinim detayinda ve matriste kullanilir.
 */
export function getTraceForRequirement(reqId, requirements, links) {
  const byId = Object.fromEntries(requirements.map((r) => [r.id, r]))
  const satisfiedBy = [] // bu (system) reqi karsilayan software'ler
  const satisfies = [] // bu (software) reqin karsiladigi system'ler
  const verifiedBy = [] // bu reqi dogrulayan test case'ler
  const verifies = [] // bu (test case) in dogruladigi reqler

  for (const l of links) {
    if (l.type === LINK_TYPE.SATISFIES) {
      if (l.fromId === reqId && byId[l.toId]) satisfiedBy.push({ link: l, req: byId[l.toId] })
      if (l.toId === reqId && byId[l.fromId]) satisfies.push({ link: l, req: byId[l.fromId] })
    }
    if (l.type === LINK_TYPE.VERIFIES) {
      if (l.fromId === reqId && byId[l.toId]) verifiedBy.push({ link: l, req: byId[l.toId] })
      if (l.toId === reqId && byId[l.fromId]) verifies.push({ link: l, req: byId[l.fromId] })
    }
  }
  return { satisfiedBy, satisfies, verifiedBy, verifies }
}

/**
 * Bir gereksinimin DURUMUNU otomatik hesaplar (DO-178C dogrulama mantigi).
 *  - Test Case'ler haric tutulur: onlarin durumu test sonucudur (manuel),
 *    bu fonksiyon onlari oldugu gibi (mevcut status) dondurur.
 *  - Diger gereksinimler icin (System / Software / Hardware):
 *      (a) hicbir test senaryosu bagli degil      -> 'In Review' (Beklemede)
 *      (b) en az 1 TC bagli ve HEPSI onayli/gecti -> 'Approved'
 *      (c) en az 1 bagli TC onaylanmamis/kaldi    -> 'Rejected'
 *  Bir TC'nin "dogrulanmis/gecmis" sayilmasi: TC.status === 'Approved'.
 *
 * @param {object} req     Durumu hesaplanacak gereksinim
 * @param {Array}  links   Tum baglar
 * @param {object} byId    id -> gereksinim haritasi
 * @returns {string} STATUS degeri
 */
export function computeRequirementStatus(req, links, byId) {
  if (!req) return STATUS.IN_REVIEW
  // Test senaryolarinin durumu manueldir (gecti/kaldi); dokunma.
  if (req.type === REQ_TYPE.TEST_CASE) return req.status

  // Bu gereksinimi dogrulayan test senaryolari (VERIFIES: fromId = req, toId = TC).
  const linkedTestCases = links
    .filter((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === req.id)
    .map((l) => byId[l.toId])
    .filter((tc) => tc && tc.type === REQ_TYPE.TEST_CASE)

  if (linkedTestCases.length === 0) return STATUS.IN_REVIEW

  const allPassed = linkedTestCases.every((tc) => tc.status === STATUS.APPROVED)
  return allPassed ? STATUS.APPROVED : STATUS.REJECTED
}

/**
 * Tum gereksinimler icin yeni (otomatik) durumlari hesaplar.
 * @returns {{ updated: Array<{id, text_id, from, to}>, next: Array }}
 *   updated: durumu degisen gereksinimler; next: yeni durumlu tam liste.
 */
export function recomputeStatuses(requirements, links) {
  const byId = Object.fromEntries(requirements.map((r) => [r.id, r]))
  const updated = []
  const next = requirements.map((r) => {
    const status = computeRequirementStatus(r, links, byId)
    if (status !== r.status) {
      updated.push({ id: r.id, text_id: r.text_id, from: r.status, to: status })
      return { ...r, status }
    }
    return r
  })
  return { updated, next }
}

/** Tipe gore gruplanmis sayim (dashboard kartlari icin). */
export function countByField(requirements, field) {
  const out = {}
  for (const r of requirements) {
    const key = r[field]
    out[key] = (out[key] || 0) + 1
  }
  return out
}

export { REQ_TYPE }
