// ============================================================================
//  useEntityFilters.js  —  Gereksinim / test listelerinin ortak filtre durumu.
//  Arama (q) + Tip + Alan + Durum + Atanan Kisi + projede tanimli TUM modular
//  ozniteliklerden olusur; tum olculer AND ile birlesir. (Oznitelikler artik
//  yalnizca 'select' tipiyle sinirli degil — bkz. attrMatches.)
//
//  Kalicilik: durum sayfa/nav-item bazli bir anahtarla sessionStorage'a yazilir
//  — kullanici baska bir sayfaya gecip geri donunce filtreler kaybolmaz, ama
//  sekme kapaninca temizlenir (tema/dil gibi kalici bir tercih degildir).
//  URL query string senkronizasyonu YAPILMAZ: uygulama sayfa gezinmesini
//  App.jsx icindeki `page` state'i ile yurutur (URL rotasi yoktur), dolayisiyla
//  yazilacak bir adres cubugu durumu da yok.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { assigneeIdsOf } from '../utils/assignees.js'

const STORAGE_PREFIX = 'ehsim_filters:'

export const EMPTY_FILTERS = { q: '', type: '', field: '', status: '', assignee: '', attrs: {} }

// Atanan Kisi filtresinin "kimseye atanmamis" secenegi. Bos dize zaten
// "filtre yok" anlamina geldigi icin ayri bir sentinel gerekir.
export const UNASSIGNED = '__unassigned__'

// Durum filtresinin gereksinim sayfalarindaki ozel degeri: gereksinimler KENDI
// baslarina onaylanmaz, DURUM sutunu onlari DOGRULAYAN test senaryosundan
// turetilir (bkz. EntityTable verifiedFor). Bagli test yoksa sutunda
// "Dogrulanamaz" yazar; filtre de ayni gorunumu hedefleyebilmelidir.
export const UNVERIFIABLE = '__unverifiable__'

function read(storageKey) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return EMPTY_FILTERS
    const saved = JSON.parse(raw)
    return { ...EMPTY_FILTERS, ...saved, attrs: { ...(saved.attrs || {}) } }
  } catch {
    return EMPTY_FILTERS
  }
}

/** Doldurulmus olcut sayisi — "N filtre aktif" rozeti ve Temizle butonu icin. */
export function countActive(filters) {
  let n = 0
  if (filters.q.trim()) n += 1
  if (filters.type) n += 1
  if (filters.field) n += 1
  if (filters.status) n += 1
  if (filters.assignee) n += 1
  for (const v of Object.values(filters.attrs || {})) if (v) n += 1
  return n
}

/**
 * Bir oznitelik degerinin filtre girdisiyle eslesmesi. Karsilastirma
 * oznitelik TIPINE gore degisir; tanim bulunamazsa (silinmis oznitelik)
 * metin gibi davranilir.
 *   select / boolean -> tam eslesme
 *   number           -> sayisal esitlik ("8" ile 8 eslesir)
 *   date             -> GUN eslesmesi (saat/dilim yok sayilir)
 *   text             -> icinde gecen (buyuk/kucuk harf duyarsiz)
 */
export function attrMatches(def, cellValue, filterValue) {
  if (cellValue === null || cellValue === undefined || cellValue === '') return false
  switch (def?.dataType) {
    case 'number': {
      const a = Number(cellValue)
      const b = Number(filterValue)
      return Number.isFinite(a) && Number.isFinite(b) && a === b
    }
    case 'date':
      return String(cellValue).slice(0, 10) === String(filterValue).slice(0, 10)
    case 'select':
    case 'boolean':
      return String(cellValue) === String(filterValue)
    default:
      return String(cellValue).toLowerCase().includes(String(filterValue).trim().toLowerCase())
  }
}

/**
 * Bir satirin TUM olcutlere uyup uymadigi (AND).
 * `statusOf` durumu sayfaya gore cozer: test sayfalarinda dogrudan r.status,
 * gereksinim sayfalarinda "dogrulanamaz" ayrimi (bkz. UNVERIFIABLE).
 * `attrDefs` oznitelik karsilastirmasinin tipini belirler (bkz. attrMatches);
 * verilmezse tum oznitelikler metin gibi eslestirilir.
 */
export function matchesFilters(row, filters, statusOf, attrDefs = []) {
  const needle = filters.q.trim().toLowerCase()
  if (needle) {
    const hay = `${row.text_id} ${row.title} ${row.description || ''}`.toLowerCase()
    if (!hay.includes(needle)) return false
  }
  if (filters.type && row.type !== filters.type) return false
  if (filters.field && row.field !== filters.field) return false
  if (filters.status && statusOf(row) !== filters.status) return false
  if (filters.assignee) {
    // Coklu atama: kayit ATANANLARDAN BIRI bu kisiyse eslesir.
    const ids = assigneeIdsOf(row)
    const wantUnassigned = filters.assignee === UNASSIGNED
    if (wantUnassigned ? ids.length > 0 : !ids.includes(filters.assignee)) return false
  }
  for (const [key, value] of Object.entries(filters.attrs || {})) {
    if (value === '' || value === null || value === undefined) continue
    const def = attrDefs.find((d) => d.key === key)
    if (!attrMatches(def, (row.attributes || {})[key], value)) return false
  }
  return true
}

export function useEntityFilters(storageKey) {
  // Sayfa nav-item bazli remount edildigi icin (App.jsx `key={page}`) baslangic
  // okumasi yeterlidir; anahtar calisma sirasinda degismez.
  const [filters, setFilters] = useState(() => read(storageKey))

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(filters))
    } catch {
      /* yok say — kalicilik olmasa da filtreleme calisir */
    }
  }, [storageKey, filters])

  const set = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setAttr = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, attrs: { ...prev.attrs, [key]: value } }))
  }, [])

  const clear = useCallback(() => setFilters({ ...EMPTY_FILTERS, attrs: {} }), [])

  const activeCount = useMemo(() => countActive(filters), [filters])

  return { filters, set, setAttr, clear, activeCount }
}
