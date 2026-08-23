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
}

// --- Izin matrisi -----------------------------------------------------------
export const PERMISSIONS = {
  [ROLES.SYSTEM_ENGINEER]: ['requirement:approve', 'requirement:delete', 'link:manage', 'project:manage'],
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
 * Kullanici adi + sifre dogrular (backend). Basarili ise kullaniciyi dondurur.
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

/**
 * Passcode ile personel girisi. Basarili ise { personnel, role, project }
 * dondurur (rol izinleriyle birlikte). Gecersizse 401 firlatir.
 */
export async function passcodeAuthenticate(passcode) {
  return api.post('/auth/passcode', { passcode })
}
