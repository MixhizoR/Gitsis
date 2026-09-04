// ============================================================================
//  navDefaults.js — Sol menu (sidebar) yerlesik varsayilan duzeni.
//
//  KRITIK KURAL: `pageKey` degerleri SABITTIR. Kullanici yalnizca GRUP
//  olusturur/siler ve mevcut sayfalari gruplar arasinda tasir; yeni bir sayfa
//  veya gereksinim/test TIPI yaratamaz. Sebep: her pageKey ayni zamanda
//  12 kademeli izin matrisinde bir bilesen anahtari (permissions.js) ve
//  backend componentKeyOf()/cascade.js eslemesinde kullanilir.
//
//  Frontend karsiligi: REQ_PAGES / TEST_PAGES anahtarlari
//  (frontend/src/utils/constants.js) ile BIREBIR ayni olmalidir.
// ============================================================================

export const NAV_PAGE_KEYS = [
  'req-user',
  'req-system',
  'req-subsystem',
  'test-acceptance',
  'test-system',
  'test-subsystem',
  'glossary',
];

// Varsayilan gruplar. `nameKey` frontend i18n anahtaridir: gruplar heniz
// DB'ye materialize edilmediyse etiket i18n'den gelir; materialize edildikten
// sonra kullanicinin verdigi duz `name` kullanilir.
//  NOT: "Gereksinimler" grubu (req-user / req-system / req-subsystem)
//  varsayilandan CIKARILDI — bu sayfalarin islevi artik ust menudeki
//  "Gereksinimler" (PBS agaci) sayfasinda birlesik olarak sunuluyor.
//  Sayfa tipleri NAV_PAGE_KEYS'te DURUYOR: kullanici isterse "+ Sayfa Ekle"
//  ile bunlari yeniden menuye koyabilir; gereksinim VERILERI etkilenmez.
export const DEFAULT_GROUPS = [
  {
    nameKey: 'nav.groupTests',
    name: 'Testler',
    order: 0,
    pageKeys: ['test-acceptance', 'test-system', 'test-subsystem'],
  },
];

// Hicbir gruba ait olmayan (en ust seviyede duran) sayfalar.
export const DEFAULT_UNGROUPED = ['glossary'];

export const isValidPageKey = (key) => NAV_PAGE_KEYS.includes(key);

/** Yerlesik varsayilan duzeni API yanit formatinda dondurur (DB'ye yazmadan). */
export function builtInLayout() {
  return {
    groups: DEFAULT_GROUPS.map((g, gi) => ({
      id: null, // heniz DB'de yok
      name: g.name,
      nameKey: g.nameKey,
      order: g.order ?? gi,
      items: g.pageKeys.map((pageKey, i) => ({ pageKey, order: i })),
    })),
    ungrouped: DEFAULT_UNGROUPED.map((pageKey, i) => ({ pageKey, order: i })),
    materialized: false,
  };
}
