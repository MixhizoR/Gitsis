// ============================================================================
//  adminService.js — Issue #90: Admin paneli VERI servisi.
//  Backend #88 uclarini cagirir; tum istekler yalnizca systemRole='ADMIN' JWT
//  ile calisir (aksi halde backend 403 doner).
// ============================================================================
import * as api from './apiClient.js'

/** Tum kullanicilari listeler. */
export async function listUsers() {
  return api.get('/admin/users')
}

/** Yeni kullanici olusturur (username, password, name, role, systemRole, clearanceLevel). */
export async function createUser(body) {
  return api.post('/admin/users', body)
}

/** Kullanicinin rol/clearance/aktiflik/proje bilgisini veya sifresini gunceller. */
export async function updateUser(id, body) {
  return api.patch(`/admin/users/${id}`, body)
}

/** Kilitli hesabin failedAttempts/lockedUntil alanlarini temizler. */
export async function unlockUser(id) {
  return api.post(`/admin/users/${id}/unlock`)
}

/** Kullaniciyi kalici olarak siler (yalnizca ADMIN; kendini/admin'i silemez). */
export async function deleteUser(id) {
  return api.del(`/admin/users/${id}`)
}

/** Auth/admin denetim kayitlarini listeler (sifre/token icermez). */
export async function listAuditLogs(params) {
  return api.get('/admin/audit-logs', params)
}

// --- AYRINTILI BILGI (permission debug/rapor icin) — Issue #101.
export async function resolveUserRole(params) {
  return api.get('/admin/resolve-role', params)
}

// --- Sistem rolleri (Issue #101) ---------------------------------------------

/** Tum sistem rollerini listeler (cekirdek + ozel). */
export async function listSystemRoles() {
  return api.get('/admin/system-roles')
}

/** Yeni (ozel) sistem rolu olusturur: { key, name, permissions? }. */
export async function createSystemRole(body) {
  return api.post('/admin/system-roles', body)
}

/** Rol guncelle: { name?, permissions?, isActive? }. */
export async function updateSystemRole(key, body) {
  return api.patch(`/admin/system-roles/${key}`, body)
}

/** Rol siler (yalnizca ozel roller; sistem rolleri backend reddeder). */
export async function deleteSystemRole(key) {
  return api.del(`/admin/system-roles/${key}`)
}
