// ============================================================================
//  requirementsService.js  —  Gereksinim CRUD servisi.
//  UI bu fonksiyonlari cagirir; verinin db.json'da (json-server) durdugunu
//  BILMEZ. Veri kaynagi degisince yalnizca db.js/api.js degisir, imzalar sabit.
//
//  v3 yenilikleri:
//   * KESIN BENZERSIZ KOD: yeni/var olan ya da silinmis (retired) bir text_id
//     ile cakisma reddedilir.
//   * OMUR BOYU KARA LISTE: silinen gereksinimin text_id'si retired listeye
//     eklenir ve bir daha kullanilamaz.
//   * OTOMATIK DURUM: durum kullanicidan alinmaz; bagli test senaryolarindan
//     hesaplanir (Test Case'ler haric — onlarin durumu test sonucudur).
// ============================================================================
import { db, COLLECTIONS, uid } from './db.js'
import { TYPE_PREFIX, STATUS, PRIORITY, DAL, REQ_TYPE, CATEGORY, CURRENT_USER } from '../utils/constants.js'
import { recomputeStatuses } from '../utils/coverage.js'
import { logEvent, logFieldChanges } from './auditService.js'
import { removeLinksForRequirement } from './linksService.js'

const TRACKED_FIELDS = ['text_id', 'title', 'description', 'type', 'category', 'priority', 'status', 'dal_level']

export const DUPLICATE_CODE_MESSAGE = 'Bu kod ile kayıtlı bir bileşen zaten var.'
export const RETIRED_CODE_MESSAGE = 'Bu kod daha önce silinmiş ve ömür boyu yeniden kullanılamaz.'

/** Tum gereksinimleri dondurur. */
export async function getRequirements() {
  return db.read(COLLECTIONS.REQUIREMENTS, [])
}

/** Tek bir gereksinimi id ile dondurur. */
export async function getRequirement(id) {
  const all = await getRequirements()
  return all.find((r) => r.id === id) || null
}

/** Silinmis (kara listeye alinmis) text_id kodlarini dondurur. */
export async function getRetiredCodes() {
  const rows = await db.read(COLLECTIONS.RETIRED, [])
  return rows.map((r) => r.text_id)
}

/**
 * Verilen text_id'nin kullanilabilir olup olmadigini dogrular.
 * @param {string} textId
 * @param {string|null} selfId  Guncelleme sirasinda kendi id'sini haric tut.
 */
async function assertCodeAvailable(textId, selfId = null) {
  const code = (textId || '').trim()
  if (!code) return
  const all = await getRequirements()
  const clash = all.some((r) => r.text_id === code && r.id !== selfId)
  if (clash) throw new Error(DUPLICATE_CODE_MESSAGE)
  const retired = await getRetiredCodes()
  if (retired.includes(code)) throw new Error(RETIRED_CODE_MESSAGE)
}

/**
 * Verilen tip icin bir sonraki bos text_id kodunu uretir.
 * Hem mevcut gereksinimleri hem de silinmis (retired) kodlari atlar.
 */
export async function generateTextId(type) {
  const prefix = TYPE_PREFIX[type] || 'REQ-GEN'
  const [all, retired] = await Promise.all([getRequirements(), getRetiredCodes()])
  const codes = [...all.map((r) => r.text_id), ...retired]
  let max = 0
  for (const code of codes) {
    if (code && code.startsWith(prefix + '-')) {
      const n = parseInt(code.split('-').pop(), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

/**
 * Yeni gereksinim olusturur. Durum otomatik atanir:
 *   - Test Case ise: verilen durum (test sonucu) ya da varsayilan In Review.
 *   - Diger tipler:  her zaman In Review (henuz bagli TC yok).
 */
export async function createRequirement(data) {
  const type = data.type || REQ_TYPE.SYSTEM
  const text_id = data.text_id?.trim() || (await generateTextId(type))

  await assertCodeAvailable(text_id, null)

  const isTestCase = type === REQ_TYPE.TEST_CASE
  const status = isTestCase ? (data.status || STATUS.IN_REVIEW) : STATUS.IN_REVIEW

  const all = await getRequirements()
  const req = {
    id: uid('req'),
    text_id,
    title: data.title?.trim() || 'Adsiz gereksinim',
    description: data.description?.trim() || '',
    type,
    category: data.category || CATEGORY.GENERAL,
    priority: data.priority || PRIORITY.MEDIUM,
    status,
    dal_level: data.dal_level || DAL.D,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: CURRENT_USER,
  }
  all.push(req)
  await db.write(COLLECTIONS.REQUIREMENTS, all)
  await logEvent({
    action: 'CREATE',
    entityId: req.id,
    textId: req.text_id,
    message: `Yeni gereksinim olusturuldu: "${req.title}" (${req.type}).`,
  })
  return req
}

/**
 * Var olan gereksinimi gunceller; degisen alanlari audit'e isler.
 * Durum yalnizca Test Case'lerde manuel guncellenebilir; diger tiplerde
 * gelen 'status' alani yok sayilir (otomatik hesaplanir).
 */
export async function updateRequirement(id, updates) {
  const all = await getRequirements()
  const idx = all.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`Gereksinim bulunamadi: ${id}`)

  const before = { ...all[idx] }

  // text_id degisiyorsa benzersizligi dogrula.
  if (updates.text_id != null && updates.text_id.trim() !== before.text_id) {
    await assertCodeAvailable(updates.text_id, id)
  }

  // Durum koruma: yalnizca Test Case manuel durum tasiyabilir.
  const safeUpdates = { ...updates }
  if (before.type !== REQ_TYPE.TEST_CASE) delete safeUpdates.status

  const after = {
    ...before,
    ...safeUpdates,
    id: before.id, // id degismez
    updatedAt: new Date().toISOString(),
  }
  all[idx] = after
  await db.write(COLLECTIONS.REQUIREMENTS, all)
  await logFieldChanges(before, after, TRACKED_FIELDS)
  return after
}

/**
 * Gereksinimi siler. Iliskili tum baglar temizlenir ve text_id kodu omur boyu
 * kara listeye (retired) alinir.
 */
export async function deleteRequirement(id) {
  const all = await getRequirements()
  const target = all.find((r) => r.id === id)
  if (!target) return false

  const remaining = all.filter((r) => r.id !== id)
  await db.write(COLLECTIONS.REQUIREMENTS, remaining)

  // Bu gereksinime bagli tum izlenebilirlik baglarini sil.
  const removedLinks = await removeLinksForRequirement(id)

  // text_id'yi omur boyu kara listeye al.
  const retired = await db.read(COLLECTIONS.RETIRED, [])
  if (!retired.some((r) => r.text_id === target.text_id)) {
    retired.push({
      id: uid('ret'),
      text_id: target.text_id,
      type: target.type,
      retiredAt: new Date().toISOString(),
      retiredBy: CURRENT_USER,
    })
    await db.write(COLLECTIONS.RETIRED, retired)
  }

  await logEvent({
    action: 'DELETE',
    entityId: id,
    textId: target.text_id,
    message: `Gereksinim silindi: "${target.title}". ${removedLinks} bag koparildi. Kod kalici olarak kilitlendi.`,
  })
  return true
}

/**
 * Tum gereksinimlerin durumunu bagli test senaryolarina gore yeniden hesaplar.
 * Yalnizca durumu degisenleri yazar ve audit'e isler.
 * @returns {Promise<number>} guncellenen gereksinim sayisi.
 */
export async function recomputeAllStatuses() {
  const [requirements, links] = await Promise.all([
    getRequirements(),
    db.read(COLLECTIONS.LINKS, []),
  ])
  const { updated, next } = recomputeStatuses(requirements, links)
  if (updated.length === 0) return 0

  await db.write(COLLECTIONS.REQUIREMENTS, next)
  for (const u of updated) {
    await logEvent({
      action: 'AUTO_STATUS',
      entityId: u.id,
      textId: u.text_id,
      field: 'status',
      oldValue: u.from,
      newValue: u.to,
      message: `Durum otomatik guncellendi: ${u.from} -> ${u.to} (bagli test senaryolarina gore).`,
    })
  }
  return updated.length
}

/** Demo veriyi yeniden yukler (tum kullanici verisini siler). */
export async function resetDatabase() {
  await db.clearAll()
}
