// ============================================================================
//  versioning.js  —  Issue #57: Gereksinim Degisim Yonetimi (SCD Type 4).
//
//  PUT /requirements/:id sirasinda ALAN BAZLI degisim tespiti yapar. Yalnizca
//  "icerik" alanlari degistiginde RequirementHistory + suspect isaretleme
//  tetiklenir. Status/approvalStatus/locked/updatedAt gibi OTOMATIK cascade
//  alanlari tetiklemez — recomputeStatusesBulk / recomputeApprovalsBulk bu
//  kolonlari updateMany/raw SQL ile DOGRUDAN yazar, PUT handler'ina ugramaz;
//  bu modul yalnizca PUT icerisinde cagrildigi icin otomatik durum gecisleri
//  tablolari cöp bagina cevirmez.
// ============================================================================

import { LINK_TYPE } from './constants.js';

// PUT'ta degisikligi tetikleyen alan listesi (issue metni: title, description,
// priority, dal_level, field). priority/dal_level artik attributes JSONB
// icinde yasadigi icin ayrica anahtar bazinda karsilastirilir; OZEL (custom)
// attribute degisiklikleri TETIKLEMEZ.
export const CONTENT_TRIGGER_FIELDS = ['title', 'description', 'field'];
export const ATTRIBUTE_TRIGGER_KEYS = ['priority', 'dal_level'];

// Icerik degisimi hangi link tiplerini suspect yapar? (fromId = degisen
// gereksinim). Alt degisimi ust baglarini suspect YAPMAZ — cunku ust baglari
// bu gereksinimin toId oldugu baglardir ve hicbir zaman burada guncellenmez.
export const SUSPECT_LINK_TYPES = [LINK_TYPE.SATISFIES, LINK_TYPE.VERIFIES];

/**
 * `data`, `before` kaydina gore ICERIK alanlarindan herhangi birini degistiriyor mu?
 * Degistirmeyen alanlar (status, approvalStatus, locked, updatedAt, text_id,
 * relatedDocuments, custom attributes) true dondurmez.
 *
 * @param {object} before  Kayittan onceki hali (Prisma satiri).
 * @param {object} data    PUT'tan gelen, temizlenmis guncel veri (yalnizca
 *                         set edilen alanlar mevcut; `data.attributes`
 *                         validateAndMergeAttributes sonucu TUM attributes).
 * @returns {boolean}
 */
export function contentFieldsChanged(before, data) {
  for (const field of CONTENT_TRIGGER_FIELDS) {
    if (data[field] !== undefined && data[field] !== before[field]) return true;
  }
  const newAttrs = data.attributes || {};
  const oldAttrs = before.attributes || {};
  for (const key of ATTRIBUTE_TRIGGER_KEYS) {
    if (newAttrs[key] !== undefined && newAttrs[key] !== oldAttrs[key]) return true;
  }
  return false;
}

/**
 * Gereksinim icin bir sonraki versiyon numarasini uretir (baz: mevcut max + 1).
 * Cagri, ayni $transaction icinde yapilmalidir ki yarista iki PUT ayni versiyonu
 * uretmesin; @@unique([requirementId, version]) guvenlik agi olarak durur.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} requirementId
 * @returns {Promise<number>}
 */
export async function nextHistoryVersion(tx, requirementId) {
  const agg = await tx.requirementHistory.aggregate({
    where: { requirementId },
    _max: { version: true },
  });
  return (agg._max.version || 0) + 1;
}
