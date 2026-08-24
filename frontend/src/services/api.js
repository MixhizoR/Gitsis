// ============================================================================
//  api.js  —  Axios tabanli REST istemcisi (json-server icin).
// ----------------------------------------------------------------------------
//  Bu modul, uygulamanin tek HTTP cikis noktasidir. json-server her ust seviye
//  koleksiyonu bir REST kaynagi olarak sunar:
//
//      GET    /requirements          -> tum kayitlar (dizi)
//      GET    /requirements/:id       -> tek kayit
//      POST   /requirements           -> yeni kayit (id govdede gelir)
//      PUT    /requirements/:id        -> kaydin tamamini degistir
//      DELETE /requirements/:id        -> kaydi sil
//
//  db.js bu fonksiyonlari kullanarak koleksiyon-seviyesi soyutlamasini korur;
//  boylece ust katmanlardaki (services / context / UI) imzalar degismez.
// ============================================================================
import axios from 'axios'

// Geliştirme ortaminda json-server varsayilan olarak 4001 portunda calisir.
// Gerekirse .env icinde VITE_API_URL ile degistirilebilir.
const BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:4001'

export const http = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ----------------------------------------------------------------------------
//  Yazma kuyrugu (serial mutation queue)
// ----------------------------------------------------------------------------
//  json-server her istekte db.json dosyasinin TAMAMINI diske yazar. Ayni anda
//  birden fazla POST/PUT/DELETE giderse (ornegin Promise.all ile), istekler
//  dosya yazimda YARISIR ve birbirini ezer (lost update) -> kayitlar rastgele
//  kaybolur, sayilar tutmaz, "Demo Sifirla" sonrasi durum bozulur.
//
//  Cozum: TUM yazma islemlerini tek bir soz zinciri (promise chain) uzerinden
//  SIRAYLA calistir. Boylece json-server her defasinda tutarli bir dosya
//  durumu uzerine yazar. Okuma (GET) islemleri kuyruk disinda kalir; onlar
//  dosyayi degistirmez, paralel gitmeleri guvenlidir.
let mutationChain = Promise.resolve()

function enqueue(task) {
  const run = mutationChain.then(task, task)
  // Zincirin bir hata yuzunden kirilmamasi icin sessizce yut; hata cagirana
  // 'run' uzerinden zaten iletiliyor.
  mutationChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** Bir koleksiyonun tum kayitlarini dondurur. */
export async function list(resource) {
  const { data } = await http.get(`/${resource}`)
  return Array.isArray(data) ? data : []
}

/** Tek bir kaydi id ile dondurur (yoksa null). */
export async function getOne(resource, id) {
  try {
    const { data } = await http.get(`/${resource}/${encodeURIComponent(id)}`)
    return data ?? null
  } catch {
    return null
  }
}

/** Yeni kayit olusturur (id, item icinde gelmelidir). Kuyruk uzerinden seri. */
export async function create(resource, item) {
  return enqueue(async () => {
    const { data } = await http.post(`/${resource}`, item)
    return data
  })
}

/** Var olan kaydin tamamini degistirir. Kuyruk uzerinden seri. */
export async function update(resource, id, item) {
  return enqueue(async () => {
    const { data } = await http.put(`/${resource}/${encodeURIComponent(id)}`, item)
    return data
  })
}

/** Bir kaydi siler. Kuyruk uzerinden seri. */
export async function remove(resource, id) {
  return enqueue(async () => {
    await http.delete(`/${resource}/${encodeURIComponent(id)}`)
    return true
  })
}

/**
 * Bir koleksiyonu istenen tam diziye "esitler" (diff senkronizasyonu).
 * json-server koleksiyon-seviyesi PUT desteklemediginden, sunucudaki mevcut
 * durumla istenen durumu karsilastirip yalnizca gereken POST/PUT/DELETE
 * cagrilarini yapar. Boylece ust katman hala "tum koleksiyonu yaz" mantigiyla
 * calisabilir.
 * @param {string} resource
 * @param {Array}  desired   istenen nihai kayit listesi (her biri .id icermeli)
 */
export async function replaceCollection(resource, desired) {
  const current = await list(resource)
  const currentById = new Map(current.map((r) => [String(r.id), r]))
  const desiredById = new Map(desired.map((r) => [String(r.id), r]))

  // 1) Silinecekler: sunucuda olup istenende olmayanlar.
  const deletions = current
    .filter((r) => !desiredById.has(String(r.id)))
    .map((r) => remove(resource, r.id))

  // 2) Eklenecek / guncellenecekler.
  const upserts = []
  for (const item of desired) {
    const existing = currentById.get(String(item.id))
    if (!existing) {
      upserts.push(create(resource, item))
    } else if (JSON.stringify(existing) !== JSON.stringify(item)) {
      upserts.push(update(resource, item.id, item))
    }
  }

  await Promise.all([...deletions, ...upserts])
  return true
}

/** Bir koleksiyondaki tum kayitlari siler. */
export async function clearCollection(resource) {
  const current = await list(resource)
  await Promise.all(current.map((r) => remove(resource, r.id)))
  return true
}
