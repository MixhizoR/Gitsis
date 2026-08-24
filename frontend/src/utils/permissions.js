// ============================================================================
//  permissions.js  —  RBAC (Rol Bazli Erisim Kontrolu) tek kaynak.
//  12 kademeli izin + 6 hiyerarsi bileseni. Rol.permissions su sekilde saklanir:
//    { read: { enabled, components: [...] }, ..., manage_roles: { enabled } }
//  Bileson anahtarlari frontend REQ_PAGES / TEST_PAGES sayfa anahtarlariyla ayni.
// ============================================================================

// --- 6 hiyerarsi bileseni ---------------------------------------------------
export const REQ_COMPONENTS = [
  { key: 'req-user', label: 'Kullanıcı Gereksinimleri' },
  { key: 'req-system', label: 'Sistem Gereksinimleri' },
  { key: 'req-subsystem', label: 'Alt-sistem Gereksinimleri' },
]
export const TEST_COMPONENTS = [
  { key: 'test-acceptance', label: 'Kabul Testleri' },
  { key: 'test-system', label: 'Sistem Testleri' },
  { key: 'test-subsystem', label: 'Alt-sistem Testleri' },
]
export const ALL_COMPONENTS = [...REQ_COMPONENTS, ...TEST_COMPONENTS]
export const ALL_COMPONENT_KEYS = ALL_COMPONENTS.map((c) => c.key)
export const REQ_COMPONENT_KEYS = REQ_COMPONENTS.map((c) => c.key)
export const TEST_COMPONENT_KEYS = TEST_COMPONENTS.map((c) => c.key)

// Satisfies bagi YUKARI dogru akar: Sistem -> Kullanici, Alt-sistem -> Sistem.
// Bir "Kullanici Gereksinimi" hicbir zaman satisfies KAYNAGI olmaz; bu yuzden
// satisfies izninin bileson secenekleri arasinda Kullanici yer almaz.
export const SATISFIES_COMPONENTS = REQ_COMPONENTS.filter((c) => c.key !== 'req-user')

// --- 12 kademeli izin -------------------------------------------------------
//  scope: 'all' | 'req' | 'test' | 'toggle'  (alt-panelde secilecek bilesenler)
export const PERMISSION_DEFS = [
  {
    key: 'read',
    num: 1,
    label: 'Okuma',
    desc: 'Gösterge paneli, hiyerarşi ve kapsam raporlarına erişim; göz ikonu ile detaylı görüntüleme.',
    scope: 'all',
  },
  {
    key: 'write',
    num: 2,
    label: 'Yazma / Düzenleme',
    desc: 'Kalem ikonu aktif: öncelik, alan ve DAL düzenleme + göz modalındaki zengin metin editörüyle açıklama.',
    scope: 'all',
  },
  {
    key: 'add_requirement',
    num: 3,
    label: 'Gereksinim Ekleme',
    desc: '“Gereksinim Ekle” butonlarını etkinleştirir.',
    scope: 'req',
  },
  {
    key: 'add_test',
    num: 4,
    label: 'Test Ekleme',
    desc: '“Test Senaryosu Ekle” butonlarını etkinleştirir.',
    scope: 'test',
  },
  {
    key: 'delete',
    num: 5,
    label: 'Silme',
    desc: 'Çöp kutusu ikonunu etkinleştirir.',
    scope: 'all',
  },
  {
    key: 'link_satisfies',
    num: 6,
    label: 'Satisfies Bağı',
    desc: 'Satisfies bağı ekleme/silme (Sistem→Kullanıcı, Alt-sistem→Sistem).',
    scope: 'satisfies',
  },
  {
    key: 'link_verifies',
    num: 7,
    label: 'Verifies Bağı',
    desc: 'Verifies bağı ekleme/silme.',
    scope: 'test',
  },
  {
    key: 'link_assigned',
    num: 8,
    label: 'Assigned To Bağı',
    desc: 'Sözlük “Assigned To” bağı ekleme/silme.',
    scope: 'req',
  },
  {
    key: 'manage_roles',
    num: 9,
    label: 'Rol Yönetimi',
    desc: 'Rol ekleme/silme/atama; Roller sayfasına erişim sağlar.',
    scope: 'toggle',
  },
  {
    key: 'manage_projects',
    num: 10,
    label: 'Proje Yönetimi',
    desc: 'Giriş ekranında proje ekleme/silme yetkisi.',
    scope: 'toggle',
  },
  {
    key: 'manage_fields',
    num: 11,
    label: 'Alanları Yönetme',
    desc: '“Alanları Yönet” işlevini etkinleştirir.',
    scope: 'toggle',
  },
  {
    key: 'approve',
    num: 12,
    label: 'Onaylama',
    desc: 'Onay (Check Circle) butonunu etkinleştirir; consensus oyuna katılır.',
    scope: 'all',
  },
]

export function scopeComponents(scope) {
  if (scope === 'req') return REQ_COMPONENTS
  if (scope === 'satisfies') return SATISFIES_COMPONENTS
  if (scope === 'test') return TEST_COMPONENTS
  if (scope === 'all') return ALL_COMPONENTS
  return []
}

// --- Bos izin seti (yeni rol) ----------------------------------------------
export function emptyPermissions() {
  const out = {}
  for (const def of PERMISSION_DEFS) {
    out[def.key] = def.scope === 'toggle' ? { enabled: false } : { enabled: false, components: [] }
  }
  return out
}

// --- Bir gereksinim/test tipini izin bilesen anahtarina esle ----------------
//  kind: 'requirement' | 'test'
export function componentKeyOf(kind, type) {
  if (kind === 'requirement') {
    if (type === 'User Requirement') return 'req-user'
    if (type === 'System Requirement') return 'req-system'
    return 'req-subsystem' // Software / Hardware
  }
  if (type === 'Acceptance Test') return 'test-acceptance'
  if (type === 'System Test') return 'test-system'
  return 'test-subsystem'
}

// --- Izin kontrolu ----------------------------------------------------------
//  permissions: rol izin objesi (PM icin null gelirse cagiran taraf bypass eder)
//  componentKey: null => toggle izinleri; aksi halde bilesen icermeli.
export function hasPermission(permissions, permKey, componentKey = null) {
  const p = permissions?.[permKey]
  if (!p || !p.enabled) return false
  if (componentKey == null) return true
  return Array.isArray(p.components) && p.components.includes(componentKey)
}
