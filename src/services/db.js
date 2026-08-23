// ============================================================================
//  db.js  —  DUSUK SEVIYE VERI ADAPTORU (Storage Abstraction Layer)
// ----------------------------------------------------------------------------
//  Bu dosya, uygulamadaki TEK fiziksel veri erisim noktasidir.
//
//  >>> ESNEK MIMARI'NIN KALBI <<<
//  Veri artik tarayicida DEGIL; proje kokundeki db.json dosyasinda KALICI
//  olarak tutulur ve json-server uzerinden REST API (Axios) ile okunup yazilir.
//  Boylece sayfa yenilense veya tarayici kapanip acilsa bile veri kaybolmaz.
//
//  Ust katmanlar (services / context / UI) hala koleksiyon-seviyesi
//  read/write imzasini cagirir; bu adaptor cagrilari api.js araciligiyla
//  uygun GET/POST/PUT/DELETE isteklerine cevirir. Veri kaynagini degistirmek
//  istediginizde yalnizca bu dosya (ve api.js) degisir; ARAYUZE DOKUNULMAZ.
// ============================================================================
import * as api from './api.js'

// Benzersiz kimlik ureteci (crypto.randomUUID destekli, fallback'li).
export function uid(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export const COLLECTIONS = {
  REQUIREMENTS: 'requirements',
  LINKS: 'links',
  AUDIT: 'audit',
  RETIRED: 'retired', // silinen text_id'lerin omur boyu kara listesi
  USERS: 'users',     // kullanici hesaplari (kimlik dogrulama)
  META: 'meta',
}

// "Demo Sifirla" sirasinda temizlenecek VERI koleksiyonlari.
// (Kullanici hesaplari korunur — users bu listede yoktur.)
export const RESETTABLE_COLLECTIONS = [
  COLLECTIONS.REQUIREMENTS,
  COLLECTIONS.LINKS,
  COLLECTIONS.AUDIT,
  COLLECTIONS.RETIRED,
]

// ---------------------------------------------------------------------------
//  REST (json-server) tabanli somut adaptor. Tum metotlar Promise dondurur.
// ---------------------------------------------------------------------------
const restAdapter = {
  /** Bir koleksiyonu (dizi) okur. */
  async read(collection, fallback = []) {
    try {
      return await api.list(collection)
    } catch (err) {
      console.error(`[db] read("${collection}") basarisiz:`, err?.message || err)
      return fallback
    }
  },

  /** Bir koleksiyonu (dizi) istenen tam icerige esitler (diff senkronu). */
  async write(collection, data) {
    try {
      await api.replaceCollection(collection, data)
      return true
    } catch (err) {
      console.error(`[db] write("${collection}") basarisiz:`, err?.message || err)
      return false
    }
  },

  /** Koleksiyonda en az bir kayit var mi? (seed kontrolu icin) */
  async exists(collection) {
    try {
      const rows = await api.list(collection)
      return Array.isArray(rows) && rows.length > 0
    } catch {
      return false
    }
  },

  /** Bir koleksiyonun tum kayitlarini siler. */
  async remove(collection) {
    return api.clearCollection(collection)
  },

  /** Tum VERI koleksiyonlarini temizler (Reset / Demo verisini sifirla). */
  async clearAll() {
    await Promise.all(RESETTABLE_COLLECTIONS.map((c) => api.clearCollection(c)))
    return true
  },
}

// ---------------------------------------------------------------------------
//  Aktif adaptor. Baska bir backend'e gecerken bu satiri degistirin.
// ---------------------------------------------------------------------------
const adapter = restAdapter

export const db = adapter

// Geriye donuk uyumluluk: bazi eski cagrilar dbAsync kullanir.
export const dbAsync = {
  read: (collection, fallback = []) => adapter.read(collection, fallback),
  write: (collection, data) => adapter.write(collection, data),
  exists: (collection) => adapter.exists(collection),
}
