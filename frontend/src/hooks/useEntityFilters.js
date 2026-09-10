// ============================================================================
//  useEntityFilters.js  —  Gereksinim / test listelerinin ortak filtre durumu.
//  Arama (q) + Tip + Alan + Durum + modular select ozniteliklerinden olusur;
//  tum olculer AND ile birlesir.
//
//  Kalicilik: durum sayfa/nav-item bazli bir anahtarla sessionStorage'a yazilir
//  — kullanici baska bir sayfaya gecip geri donunce filtreler kaybolmaz, ama
//  sekme kapaninca temizlenir (tema/dil gibi kalici bir tercih degildir).
//  URL query string senkronizasyonu YAPILMAZ: uygulama sayfa gezinmesini
//  App.jsx icindeki `page` state'i ile yurutur (URL rotasi yoktur), dolayisiyla
//  yazilacak bir adres cubugu durumu da yok.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_PREFIX = 'ehsim_filters:'

export const EMPTY_FILTERS = { q: '', type: '', field: '', status: '', attrs: {} }

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
  for (const v of Object.values(filters.attrs || {})) if (v) n += 1
  return n
}

/**
 * Bir satirin TUM olcutlere uyup uymadigi (AND).
 * `statusOf` durumu sayfaya gore cozer: test sayfalarinda dogrudan r.status,
 * gereksinim sayfalarinda "dogrulanamaz" ayrimi (bkz. UNVERIFIABLE).
 */
export function matchesFilters(row, filters, statusOf) {
  const needle = filters.q.trim().toLowerCase()
  if (needle) {
    const hay = `${row.text_id} ${row.title} ${row.description || ''}`.toLowerCase()
    if (!hay.includes(needle)) return false
  }
  if (filters.type && row.type !== filters.type) return false
  if (filters.field && row.field !== filters.field) return false
  if (filters.status && statusOf(row) !== filters.status) return false
  for (const [key, value] of Object.entries(filters.attrs || {})) {
    if (!value) continue
    if (String((row.attributes || {})[key] ?? '') !== value) return false
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
