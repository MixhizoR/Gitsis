// ============================================================================
//  authService.js  —  Kimlik dogrulama VERI servisi (KURUMSAL BACKEND).
//  Kullanici hesaplari artik kalici PostgreSQL "Users" tablosunda tutulur ve
//  Express /api/auth uclari uzerinden okunup yazilir. Sifre dogrulamasi
//  sunucuda yapilir. Oturum (session) bilgisi yalnizca tarayicida tutulur.
//
//  Roller/izinler ISTEMCI tarafinda tutulur (UI yetkilendirmesi). Backend
//  rol string'ini ('System Engineer' / 'Developer' vb.) istemci izin setine
//  esleriz. Tek-kullanicili muhendislik araci oldugundan, tanimlanamayan bir
//  rol de varsayilan olarak Sistem Muhendisi yetkilerini alir (link:manage
//  calissin diye).
// ============================================================================
import * as api from './apiClient.js'

// Issue #101: sistem rol anahtari icin kanonik kaynak. AuthContext
// `roleKey === 'pm' || role === PM_ROLE` ile PM tespiti yapar.
export const PM_ROLE = 'Proje Yöneticisi'

// --- Rol tanimlari (istemci; kayit ekraninda secilir) -----------------------
//  Backend'e gonderilen deger cevrilmez; bu etiketler ayni zamanda backend
//  User.role alanina yazilir.
export const ROLES = {
  SYSTEM_ENGINEER: 'System Engineer',
  DEVELOPER: 'Developer',
}

// Kullaniciya gosterilen Turkce etiketler (deger degismez).
export const ROLE_LABELS = {
  [ROLES.SYSTEM_ENGINEER]: 'Sistem Mühendisi',
  [ROLES.DEVELOPER]: 'Geliştirici',
  [PM_ROLE]: 'Proje Yöneticisi',
}

// --- Izin matrisi -----------------------------------------------------------
export const PERMISSIONS = {
  [ROLES.SYSTEM_ENGINEER]: [
    'requirement:approve',
    'requirement:delete',
    'link:manage',
    'project:manage',
  ],
  [ROLES.DEVELOPER]: [],
}

/**
 * Bir rol string'i icin izinleri dondurur. Backend'den gelen serbest rol
 * degerleri de olabilecegi icin, "developer/gelistirici" disindaki her rol
 * Sistem Muhendisi yetkilerini alir (arac tek-kullanicili calissin diye).
 */
export function permissionsFor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('develop') || r.includes('geliş') || r.includes('gelis')) {
    return PERMISSIONS[ROLES.DEVELOPER]
  }
  return PERMISSIONS[ROLES.SYSTEM_ENGINEER]
}

/** Ad Soyad'dan bas harfler (maks 2 karakter). */
export function toInitials(name) {
  return (
    (name || '')
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '??'
  )
}

/** Tum kullanicilari dondurur (backend). */
export async function getUsers() {
  return api.get('/users')
}

/**
 * Kullanici adi + sifre dogrular (backend). Basarili ise
 * { accessToken, refreshToken, user } dondurur.
 * @throws sunucu hatasi / gecersiz kimlik.
 */
export async function authenticate(username, password) {
  return api.post('/auth/login', { username, password })
}

/**
 * Yeni kullanici olusturur (backend, benzersiz kullanici adi). Olusan kaydi
 * dondurur.
 * @throws kullanici adi zaten varsa (409) veya dogrulama hatasi.
 */
export async function createUser({ username, password, name, role }) {
  return api.post('/auth/register', { username, password, name, role })
}

// Issue #97: passcodeAuthenticate KALDIRILDI — tek giris yolu /auth/login.
// Personnel (passcode ile giren kisiler) modeli backend'den de kaldirildi.

/**
 * Refresh token'i sunucuda revoke eder (logout). Basarisiz olsa da cagiran
 * taraf oturumu temizlemeye devam eder (best-effort).
 */
export async function logoutRefresh(refreshToken) {
  return api.post('/auth/logout', { refreshToken })
}
