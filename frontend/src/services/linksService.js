// ============================================================================
//  linksService.js  —  Izlenebilirlik (Traceability) bag servisi.
//  Cift yonlu iliskiler: Satisfies (SW -> SYS) ve Verifies (TC -> REQ).
//  Bag = { id, fromId, toId, type, createdAt, createdBy }
//    fromId : ust seviye gereksinim (parent)
//    toId   : alt seviye nesne (child)
// ============================================================================
import { db, COLLECTIONS, uid } from './db.js'
import { LINK_RULES, CURRENT_USER } from '../utils/constants.js'
import { logEvent } from './auditService.js'

/** Tum baglari dondurur. */
export async function getLinks() {
  return db.read(COLLECTIONS.LINKS, [])
}

/**
 * Bir gereksinime dokunan (kaynak ya da hedef olarak) tum baglari dondurur.
 */
export async function getLinksForRequirement(reqId) {
  const links = await getLinks()
  return links.filter((l) => l.fromId === reqId || l.toId === reqId)
}

/**
 * Bag kurulup kurulamayacagini dogrular.
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateLink(fromReq, toReq, type) {
  if (!fromReq || !toReq) return { ok: false, error: 'Gecersiz gereksinim secimi.' }
  if (fromReq.id === toReq.id) return { ok: false, error: 'Bir gereksinim kendine baglanamaz.' }

  const rule = LINK_RULES[type]
  if (!rule) return { ok: false, error: 'Bilinmeyen bag tipi.' }

  if (!rule.from.includes(fromReq.type)) {
    return { ok: false, error: `"${type}" baginda kaynak ${rule.fromLabel} olmalidir.` }
  }
  if (!rule.to.includes(toReq.type)) {
    return { ok: false, error: `"${type}" baginda hedef ${rule.toLabel} olmalidir.` }
  }
  return { ok: true }
}

/**
 * Yeni bag ekler. Ayni bag zaten varsa tekrar eklemez.
 * @param {object} fromReq  Ust seviye gereksinim nesnesi
 * @param {object} toReq    Alt seviye nesne
 * @param {string} type     LINK_TYPE
 */
export async function addLink(fromReq, toReq, type) {
  const check = validateLink(fromReq, toReq, type)
  if (!check.ok) throw new Error(check.error)

  const links = await getLinks()
  const duplicate = links.find(
    (l) => l.fromId === fromReq.id && l.toId === toReq.id && l.type === type
  )
  if (duplicate) throw new Error('Bu bag zaten mevcut.')

  const link = {
    id: uid('lnk'),
    fromId: fromReq.id,
    toId: toReq.id,
    type,
    createdAt: new Date().toISOString(),
    createdBy: CURRENT_USER,
  }
  links.push(link)
  await db.write(COLLECTIONS.LINKS, links)

  await logEvent({
    action: 'LINK',
    entityType: 'link',
    entityId: link.id,
    textId: `${fromReq.text_id} -> ${toReq.text_id}`,
    message: `Bag kuruldu: ${fromReq.text_id} «${type}» ${toReq.text_id}.`,
  })
  return link
}

/** Bag siler (Unlink). */
export async function removeLink(linkId, meta = {}) {
  const links = await getLinks()
  const link = links.find((l) => l.id === linkId)
  if (!link) return false

  const remaining = links.filter((l) => l.id !== linkId)
  await db.write(COLLECTIONS.LINKS, remaining)

  await logEvent({
    action: 'UNLINK',
    entityType: 'link',
    entityId: linkId,
    textId: meta.label || linkId,
    message: meta.message || `Bag koparildi (${link.type}).`,
  })
  return true
}

/**
 * Bir gereksinim silindiginde ona dokunan tum baglari sessizce temizler.
 * @returns silinen bag sayisi
 */
export async function removeLinksForRequirement(reqId) {
  const links = await getLinks()
  const remaining = links.filter((l) => l.fromId !== reqId && l.toId !== reqId)
  const removed = links.length - remaining.length
  if (removed > 0) await db.write(COLLECTIONS.LINKS, remaining)
  return removed
}
