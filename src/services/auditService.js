// ============================================================================
//  auditService.js  —  Degisiklik Tarihcesi (Audit Log) servisi.
//  Gereksinimler ve baglar uzerindeki her mutasyon buraya kaydedilir:
//  kim, ne zaman, hangi alanda, eski deger -> yeni deger.
//  Bu katman da yalnizca db adaptoru uzerinden calisir (kaynak bagimsiz).
// ============================================================================
import { db, COLLECTIONS, uid } from './db.js'
import { CURRENT_USER } from '../utils/constants.js'

/** Tum audit kayitlarini (en yeni en ustte) dondurur. */
export async function getAuditLog() {
  const log = await db.read(COLLECTIONS.AUDIT, [])
  return [...log].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

/** Belirli bir varlik (gereksinim) icin audit kayitlarini dondurur. */
export async function getAuditFor(entityId) {
  const log = await getAuditLog()
  return log.filter((e) => e.entityId === entityId)
}

/**
 * Yeni bir audit kaydi olusturur.
 * @param {object} entry
 *   action     'CREATE' | 'UPDATE' | 'DELETE' | 'LINK' | 'UNLINK' | 'RESET' ...
 *   entityType 'requirement' | 'link' | 'system'
 *   entityId   ilgili kaydin id'si
 *   textId     okunakli kod (REQ-SYS-001)
 *   field      degisen alan adi (UPDATE icin)
 *   oldValue / newValue
 *   message    serbest metin aciklama
 */
export async function logEvent(entry) {
  const log = await db.read(COLLECTIONS.AUDIT, [])
  const record = {
    id: uid('aud'),
    timestamp: new Date().toISOString(),
    user: entry.user || CURRENT_USER,
    action: entry.action,
    entityType: entry.entityType || 'requirement',
    entityId: entry.entityId ?? '-',
    textId: entry.textId ?? '-',
    field: entry.field ?? null,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    message: entry.message || '',
  }
  log.push(record)
  await db.write(COLLECTIONS.AUDIT, log)
  return record
}

/**
 * Bir guncelleme isleminde degisen her alan icin ayri audit kaydi uretir.
 * @param {object} before  Onceki gereksinim nesnesi
 * @param {object} after   Yeni gereksinim nesnesi
 * @param {string[]} fields Izlenecek alanlar
 */
export async function logFieldChanges(before, after, fields) {
  const friendly = {
    title: 'Baslik',
    description: 'Tanim',
    type: 'Tip',
    category: 'Alan',
    priority: 'Oncelik',
    status: 'Durum',
    dal_level: 'DAL Seviyesi',
    text_id: 'Kod',
  }
  for (const field of fields) {
    if (before[field] !== after[field]) {
      await logEvent({
        action: 'UPDATE',
        entityType: 'requirement',
        entityId: after.id,
        textId: after.text_id,
        field,
        oldValue: before[field],
        newValue: after[field],
        message: `${friendly[field] || field} guncellendi.`,
      })
    }
  }
}
