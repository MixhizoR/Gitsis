// ============================================================================
//  assignees.js  —  COKLU sorumlu personel (is atama) yardimcilari.
//
//  DIKKAT: Sozlukteki "Assigned To" izlenebilirlik BAGI (terim <-> gereksinim)
//  ile ilgisi YOKTUR; bu alan isin KIMDE oldugunu tutar.
//
//  Backend her kayitla birlikte SIRALI bir `assigneeIds` dizisi doner
//  (bkz. backend/src/assignees.js). Eski tek-atama alani `assigneeId`
//  yanitta listenin ilk elemani olarak KORUNUR; henuz guncellenmemis bir
//  kaynaktan (orn. anlik goruntu/snapshot verisi) gelen kayitlarda ise
//  yalnizca o alan bulunabilir. Asagidaki cozumleyici iki sekli de kabul
//  eder, boylece UI tek bir dizi uzerinden calisir.
// ============================================================================
import { personnelName } from './format.js'

/** Bir kaydin atanan personel id'leri, atama sirasiyla. */
export function assigneeIdsOf(row) {
  if (!row) return []
  if (Array.isArray(row.assigneeIds)) return row.assigneeIds.filter(Boolean)
  return row.assigneeId ? [row.assigneeId] : []
}

/** Kayit bu kisiye atanmis mi? (coklu atamada herhangi biri olmasi yeter) */
export function isAssignedTo(row, personnelId) {
  if (!personnelId) return false
  return assigneeIdsOf(row).includes(personnelId)
}

/**
 * Atananlarin gorunur adlari, atama sirasiyla.
 * Personel silinmisse atama zaten dusmustur; yine de savunmaci davranip
 * cozulemeyen id'yi listeden cikaririz.
 */
export function assigneeNamesOf(row, personnel) {
  const byId = new Map((personnel || []).map((p) => [p.id, p]))
  return assigneeIdsOf(row)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => personnelName(p))
}
