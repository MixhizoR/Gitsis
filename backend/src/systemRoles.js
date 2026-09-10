// ============================================================================
//  systemRoles.js  —  Issue #101: Sistem-geneli sabit roller + varsayilanlar.
//  User.role (serbest metin) icin SISTEM seviyesinde tanimli cekirdek roller.
//  `permissions` semasi: frontend/utils/permissions.js (12 kademeli izin).
//  isSystem=true olanlar silinemez (yalnizca pasiflestirilebilir).
// ============================================================================
import { PM_ROLE } from './constants.js';

const ALL_COMPONENTS = ['req-user', 'req-system', 'req-subsystem', 'test-acceptance', 'test-system', 'test-subsystem'];

// Toggle izinler (bilesen kapsami yok).
const T = (enabled) => ({ enabled });

// Bilesen-kapsamli izinler.
const C = (components) => ({ enabled: true, components });

// --- Varsayilan izin kumeleri ------------------------------------------------
//  PM: her sey acik. System Engineer: teknik matrisin tamami. Developer:
//  yalnizca okuma/yazma (silme/onay/yonetim yok). Admin: konsol-only hesap
//  (roleKey='admin' gecisi), proje ekranlarina girmez.
const ALL_PERMS = {
  read: C(ALL_COMPONENTS),
  write: C(ALL_COMPONENTS),
  add_requirement: C(['req-user', 'req-system', 'req-subsystem']),
  add_test: C(['test-acceptance', 'test-system', 'test-subsystem']),
  delete: C(ALL_COMPONENTS),
  link_satisfies: C(['req-system', 'req-subsystem']),
  link_verifies: C(['test-acceptance', 'test-system', 'test-subsystem']),
  link_assigned: C(['req-user', 'req-system', 'req-subsystem']),
  manage_roles: T(true),
  manage_projects: T(true),
  manage_fields: T(true),
  approve: C(ALL_COMPONENTS),
};

const SE_PERMS = {
  read: C(ALL_COMPONENTS),
  write: C(ALL_COMPONENTS),
  add_requirement: C(['req-user', 'req-system', 'req-subsystem']),
  add_test: C(['test-acceptance', 'test-system', 'test-subsystem']),
  delete: C(ALL_COMPONENTS),
  link_satisfies: C(['req-system', 'req-subsystem']),
  link_verifies: C(['test-acceptance', 'test-system', 'test-subsystem']),
  link_assigned: C(['req-user', 'req-system', 'req-subsystem']),
  manage_roles: T(false),
  manage_projects: T(false),
  manage_fields: T(false),
  approve: C(ALL_COMPONENTS),
};

const DEV_PERMS = {
  read: C(ALL_COMPONENTS),
  write: C(ALL_COMPONENTS),
  add_requirement: T(false),
  add_test: T(false),
  delete: T(false),
  link_satisfies: T(false),
  link_verifies: T(false),
  link_assigned: T(false),
  manage_roles: T(false),
  manage_projects: T(false),
  manage_fields: T(false),
  approve: T(false),
};

// --- Sabit cekirdek roller ---------------------------------------------------
//  key: benzersiz, User.roleKey ile eslesir. name: display adi (eski serbest
//  metin degerleriyle uyumlu: 'Proje Yoneticisi' PM_ROLE ile ayni).
export const SYSTEM_ROLE_DEFAULTS = [
  {
    key: 'pm',
    name: 'Proje Yöneticisi',
    permissions: ALL_PERMS,
    isSystem: true,
  },
  {
    key: 'system_engineer',
    name: 'System Engineer',
    permissions: SE_PERMS,
    isSystem: true,
  },
  {
    key: 'developer',
    name: 'Developer',
    permissions: DEV_PERMS,
    isSystem: true,
  },
  {
    key: 'admin',
    name: 'Admin',
    permissions: ALL_PERMS,
    isSystem: true,
  },
];

// --- Idempotent seed ---------------------------------------------------------
//  Her startup'ta cagrilabilir: eksik sistem rollerini ekler, var olanlarin
//  sadece permissions/isSystem durumunu guvenceye alir (isActive'e dokunmaz
//  — admin kapatmis olabilir).
export async function ensureSystemRoles(prisma) {
  for (const def of SYSTEM_ROLE_DEFAULTS) {
    const existing = await prisma.systemRole.findUnique({ where: { key: def.key } });
    if (!existing) {
      await prisma.systemRole.create({
        data: {
          key: def.key,
          name: def.name,
          permissions: def.permissions,
          isSystem: def.isSystem,
          isActive: true,
        },
      });
      console.log(`[system-roles] ${def.key} olusturuldu`);
    } else if (existing.isSystem !== def.isSystem || !existing.isActive) {
      await prisma.systemRole.update({
        where: { key: def.key },
        data: { isSystem: def.isSystem, isActive: true },
      });
    }
  }
}

// --- Tek kanonik rol cozumu (Issue #101, A karari) ---------------------------
//  Oncelik sirasi:
//    1) user.roleKey -> aktif SystemRole varsa: o rol (yetki de buradan gelir).
//    2) user.role serbest metni PM_ROLE eslesmesi -> { key: 'pm', ... }.
//    3) Ikisi de yoksa: en dusuk yetkili varsayilan (developer).
//  Amac: `role` (display) ile `roleKey` (yetki) birbirinden saptiginda tek
//  bir dogruluk kaynagi olsun; eski veriler (roleKey=null) calismaya devam etsin.

export async function resolveUserRole(prisma, user) {
  if (user?.roleKey) {
    const sr = await prisma.systemRole.findUnique({ where: { key: String(user.roleKey) } });
    if (sr && sr.isActive) {
      return { key: sr.key, name: sr.name, permissions: sr.permissions || {}, system: sr.isSystem };
    }
    // roleKey gecersiz/pasif: asagidaki PM fallback'e dus.
  }
  if (user?.role === PM_ROLE) {
    const sr = await prisma.systemRole.findUnique({ where: { key: 'pm' } }).catch(() => null);
    if (sr && sr.isActive) {
      return { key: sr.key, name: sr.name, permissions: sr.permissions || {}, system: true };
    }
    return { key: 'pm', name: PM_ROLE, permissions: {}, system: true };
  }
  return { key: 'developer', name: 'Developer', permissions: {}, system: false };
}

/** PM tespiti icin tek kanonik kontrol: roleKey==='pm' OR serbest-metin fallback. */
export function isPMRole(user) {
  return user?.roleKey === 'pm' || user?.role === PM_ROLE;
}

/** Admin tespiti icin tek kanonik kontrol (Issue #101: Admin bir ROL'dur). */
export function isAdminRole(user) {
  return user?.roleKey === 'admin';
}
