// ============================================================================
//  suspect.js  —  Issue #57: supheli (suspect) bag yardimcilari (saf).
//  Backend kuraliyla birebir: icerik degisimi yalnizca degisen gereksinimin
//  fromId oldugu Satisfies + Verifies baglarini suspect isaretler. Alt
//  degisimi ust baglarini suspect YAPMAZ (o baglar toId tarafidir).
//  Bu modul UI'da gosterge/temizleme mantigini besler; backend'deki
//  SUSPECT_LINK_TYPES ile senkron tutulmali (backend/src/versioning.js).
// ============================================================================
import { LINK_TYPE } from './constants.js'

// Backend src/versioning.js SUSPECT_LINK_TYPES ile ayni olmali.
export const SUSPECT_LINK_TYPES = [LINK_TYPE.SATISFIES, LINK_TYPE.VERIFIES]

/**
 * Bir gereksinimin suspect OLAN cikis baglari (fromId = gereksinim).
 * @param {Array} links
 * @param {string} requirementId
 */
export function suspectLinksForRequirement(links, requirementId) {
  return (links || []).filter(
    (l) => l.isSuspect && l.fromId === requirementId && SUSPECT_LINK_TYPES.includes(l.type),
  )
}

/**
 * Bir testin suspect OLAN giris baglari (toId = test, Verifies).
 * Testler bag kaynagi degildir; suspect ancak kaynak gereksinimdeki
 * icerik degisimiyle gelir (gelen Verifies baglari).
 * @param {Array} links
 * @param {string} testId
 */
export function suspectLinksForTestCase(links, testId) {
  return (links || []).filter(
    (l) => l.isSuspect && l.toId === testId && l.type === LINK_TYPE.VERIFIES,
  )
}

/**
 * Bir satirin (gereksinim veya test) suspect olup olmadigini dondurur.
 * @param {Array} links
 * @param {string} id
 * @param {'requirement'|'test'} kind
 */
export function hasSuspectLinks(links, id, kind = 'requirement') {
  return suspectLinksFor(links, id, kind).length > 0
}

/**
 * Bir satirin suspect bag SAYISI.
 */
export function suspectCountFor(links, id, kind = 'requirement') {
  return suspectLinksFor(links, id, kind).length
}

function suspectLinksFor(links, id, kind) {
  return kind === 'test'
    ? suspectLinksForTestCase(links, id)
    : suspectLinksForRequirement(links, id)
}
