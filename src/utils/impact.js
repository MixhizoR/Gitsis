// ============================================================================
//  impact.js  —  Etki Analizi (Impact Analysis) mantigi.
//  Mevcut Satisfies / Verifies baglarinin uzerine kurulur: bir gereksinim
//  degistiginde hangi test senaryolarinin yeniden calistirilmasi, hangi UST
//  gereksinimlerin gozden gecirilmesi ve hangi ilgili dokumanlarin
//  guncellenmesi gerektigini zincir (agac) olarak hesaplar.
//  Saf (pure) fonksiyonlar: gireni gereksinimler + baglar, cikani agac.
// ============================================================================
import { getTraceForRequirement } from './coverage.js'

/**
 * Bir gereksinim icin etki agacini kurar. Kok dugum = degisen gereksinimin
 * kendisi; her dugumun `parents` dizisi Satisfies bagiyla karsiladigi UST
 * gereksinim(ler)i (varsa) icerir ve rekursif olarak yukari tirmanir.
 * Dongulere (teorik olarak olmamali ama veri hatasina karsi) karsi korumali.
 *
 * @param {string} reqId
 * @param {Array} requirements
 * @param {Array} links
 * @returns {{
 *   requirement: object, tests: Array, documents: string[], parents: Array
 * } | null}
 */
export function buildImpactTree(reqId, requirements, links) {
  const byId = Object.fromEntries(requirements.map((r) => [r.id, r]))
  const root = byId[reqId]
  if (!root) return null

  const visiting = new Set()

  const build = (req) => {
    if (visiting.has(req.id)) return null // dongu koruma
    visiting.add(req.id)
    const { satisfies, verifiedBy } = getTraceForRequirement(req.id, requirements, links)
    const node = {
      requirement: req,
      tests: verifiedBy.map((v) => v.req),
      documents: req.relatedDocuments || [],
      parents: satisfies.map((s) => build(s.req)).filter(Boolean),
    }
    visiting.delete(req.id)
    return node
  }

  return build(root)
}

/**
 * Etki agacini gezip toplam benzersiz test / ust gereksinim / dokuman
 * sayilarini cikarir (ozet kartlari icin).
 * @param {object} tree buildImpactTree cikisi
 * @returns {{ testCount:number, parentCount:number, documentCount:number }}
 */
export function summarizeImpact(tree) {
  const testIds = new Set()
  const parentIds = new Set()
  const documents = new Set()

  const walk = (node, isRoot) => {
    if (!node) return
    node.tests.forEach((t) => testIds.add(t.id))
    node.documents.forEach((d) => documents.add(d))
    if (!isRoot) parentIds.add(node.requirement.id)
    node.parents.forEach((p) => walk(p, false))
  }
  walk(tree, true)

  return { testCount: testIds.size, parentCount: parentIds.size, documentCount: documents.size }
}
