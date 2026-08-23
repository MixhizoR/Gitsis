// ============================================================================
//  apiClient.js  —  Yeni kurumsal backend (Express + Prisma + PostgreSQL) icin
//  TEK HTTP cikis noktasi. Taban yol: <API_URL>/api
//  json-server DEGIL; kalici, proje-bazli REST API'ye baglanir.
// ============================================================================
import axios from 'axios'

const BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:4001'

export const http = axios.create({
  baseURL: `${BASE_URL}/api`,
  // headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
})

// AuthContext.jsx'teki oturum anahtariyla AYNI olmali.
const SESSION_KEY = 'ehsim_auth_session'

// Her istege, varsa oturum token'ini Authorization basligi olarak ekler.
http.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const token = raw ? JSON.parse(raw)?.token : null
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch {
    /* yoksay */
  }
  return config
})

// Token gecersiz/suresi dolmussa (ya da bu guvenlik guncellemesinden ONCE
// alinmis, token'siz eski bir oturumsa) oturumu temizleyip giris ekranina
// don. (Giristen ONCE atilan, hic oturumu olmayan istekler icin sessizce
// hata firlat — aksi halde Login ekraninda sonsuz yenileme dongusune girer.)
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      let hadSession = false
      try {
        hadSession = Boolean(JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'))
      } catch {
        /* yoksay */
      }
      if (hadSession) {
        localStorage.removeItem(SESSION_KEY)
        window.location.reload()
      }
    }
    return Promise.reject(err)
  }
)

// Hata mesajlarini backend'in {error} govdesinden okunakli hale getir.
function toError(err) {
  const msg = err?.response?.data?.error || err?.message || 'Sunucu hatasi.'
  const e = new Error(msg)
  e.status = err?.response?.status
  return e
}

export async function get(path, params) {
  try {
    const { data } = await http.get(path, { params })
    return data
  } catch (err) {
    throw toError(err)
  }
}
export async function post(path, body) {
  try {
    const { data } = await http.post(path, body)
    return data
  } catch (err) {
    throw toError(err)
  }
}
export async function put(path, body) {
  try {
    const { data } = await http.put(path, body)
    return data
  } catch (err) {
    throw toError(err)
  }
}
export async function patch(path, body) {
  try {
    const { data } = await http.patch(path, body)
    return data
  } catch (err) {
    throw toError(err)
  }
}
export async function del(path) {
  try {
    const { data } = await http.delete(path)
    return data
  } catch (err) {
    throw toError(err)
  }
}

/** Backend erisilebilir mi? (baglanti testi) */
export async function ping() {
  try {
    await get('/health')
    return true
  } catch {
    return false
  }
}

// TraceabilityImportPage.jsx icin dosya yukleme fonksiyonu. FormData ile multipart/form-data gonderir.
export async function upload(path, formData) {
  try {
    const { data } = await http.post(path, formData, {
      headers: {
        // Axios multipart/form-data'yi kendisi ayarlar; biz Content-Type'i undefined yaparsak, Axios boundary'yi otomatik ekler.
        'Content-Type': undefined,
      },
    })
    return data
  } catch (err) {
    throw toError(err)
  }
}
