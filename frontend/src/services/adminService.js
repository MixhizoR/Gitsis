// ============================================================================
//  adminService.js — Issue #90: Admin paneli VERI servisi.
//  Backend #88 uclarini cagirir; tum istekler yalnizca systemRole='ADMIN' JWT
//  ile calisir (aksi halde backend 403 doner).
// ============================================================================
import * as api from './apiClient.js'

/** Tum kullanicilari listeler. */
export async function listUsers() {
  return api.get('/users')
}

/** Yeni kullanici olusturur (username, password, name, role, systemRole, clearanceLevel). */
export async function createUser(body) {
  return api.post('/users', body)
}

/** Kullanicinin rol/clearance/aktiflik/proje bilgisini veya sifresini gunceller. */
export async function updateUser(id, body) {
  return api.patch(`/users/${id}`, body)
}

/** Kilitli hesabin failedAttempts/lockedUntil alanlarini temizler. */
export async function unlockUser(id) {
  return api.post(`/users/${id}/unlock`)
}

/** Auth/admin denetim kayitlarini listeler (sifre/token icermez). */
export async function listAuditLogs(params) {
  return api.get('/audit-logs', params)
}
