// ============================================================================
//  apiClient.js  —  Yeni kurumsal backend (Express + Prisma + PostgreSQL) icin
//  TEK HTTP cikis noktasi. Taban yol: <API_URL>/api
//  json-server DEGIL; kalici, proje-bazli REST API'ye baglanir.
// ============================================================================
import axios from 'axios'

const BASE_URL = '/api'

export const http = axios.create({
  baseURL: BASE_URL,
  // headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
})

// AuthContext.jsx'teki oturum anahtariyla AYNI olmali.
const SESSION_KEY = 'ehsim_auth_session'

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function writeSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  else localStorage.removeItem(SESSION_KEY)
}

// Oturum gecersizlesince tum uygulamaya bildir (AuthContext dinler -> Login).
function emitSessionExpired() {
  window.dispatchEvent(new CustomEvent('ehsim:auth-expired'))
}

// --- Tek-seferlik (single-flight) sessiz yenileme (Issue #89) --------------
//  Ayni anda birden fazla 401 gelirse yalnizca 1 refresh istegi gider; digerleri
//  ayni promise'i bekler (AC). Refresh cagrisi AYRI bir Axios cagrisi kullanir
//  ki kendi 401'i yeniden refresh'i tetiklemesin (sonsuz dongu yok).
let refreshPromise = null

async function doRefresh() {
  const s = readSession()
  if (!s?.refreshToken) {
    writeSession(null)
    emitSessionExpired()
    throw new Error('refresh token yok')
  }
  const res = await axios.post('/api/auth/refresh', { refreshToken: s.refreshToken })
  const { accessToken, refreshToken } = res.data || {}
  if (!accessToken || !refreshToken) {
    writeSession(null)
    emitSessionExpired()
    throw new Error('refresh yaniti gecersiz')
  }
  writeSession({ ...s, accessToken, refreshToken })
  return { accessToken, refreshToken }
}

function ensureRefresh() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// Her istege, varsa oturum access token'ini Authorization basligi olarak ekler.
http.interceptors.request.use((config) => {
  const s = readSession()
  if (s?.accessToken) config.headers.Authorization = `Bearer ${s.accessToken}`
  return config
})

// Token gecersiz/suresi dolduysa: sessizce yenile (_retried ile tek deneme),
// basarisizsa oturumu temizle -> Login ekranina don. Oturumsuz istekler (Login
// sayfasindaki giris denemesi) icin sessizce hata firlat — sonsuz dongu yok.
http.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status
    const cfg = err?.config
    const hadSession = readSession()?.refreshToken
    if (status === 401 && hadSession && cfg && !cfg._retried) {
      cfg._retried = true
      try {
        await ensureRefresh()
        return http(cfg)
      } catch (refreshErr) {
        writeSession(null)
        emitSessionExpired()
        return Promise.reject(refreshErr)
      }
    }
    if (status === 401 && hadSession) {
      writeSession(null)
      emitSessionExpired()
    }
    // Issue #103: proje erisimi kalktiysa (uyelikten cikarildi) calisma alanini
    // kapat — ProjectSelect yalnizca uye olunan projeleri tekrar listeler.
    if (status === 403 && err?.response?.data?.code === 'PROJECT_ACCESS_DENIED') {
      window.dispatchEvent(new CustomEvent('ehsim:project-access-denied'))
    }
    return Promise.reject(err)
  },
)

// Hata mesajlarini backend'in {error} govdesinden okunakli hale getir.
function toError(err) {
  const msg = err?.response?.data?.error || err?.message || 'Sunucu hatasi.'
  const e = new Error(msg)
  e.status = err?.response?.status
  e.code = err?.response?.data?.code || null
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
