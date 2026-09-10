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
import { REQ_TYPE } from './constants.js';

export const NAV_PAGE_KEYS = [
  'req-user',
  'req-system',
  'req-subsystem',
  'test-acceptance',
  'test-system',
  'test-subsystem',
  'glossary',
];

// Birden fazla gereksinim TIPINI birlikte gosteren pageKey'ler icin gecerli
// Tip filtresi degerleri (Alan/fieldFilter'a benzer, ama disiplin degil
// REQ_TYPE bazli). Yalnizca 'req-subsystem' Software+Hardware'i birlikte
// gosterir; digerlerinde tek tip sabit oldugu icin filtreye gerek yoktur.
// Frontend karsiligi: REQ_PAGES[key].typeOptions (frontend/src/utils/constants.js).
export const PAGE_TYPE_OPTIONS = {
  'req-subsystem': [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
};

export const isValidTypeFilter = (pageKey, typeFilter) => {
  if (!typeFilter) return true;
  const options = PAGE_TYPE_OPTIONS[pageKey];
  return Boolean(options && options.includes(typeFilter));
};

// Varsayilan gruplar. `nameKey` frontend i18n anahtaridir: gruplar heniz
// DB'ye materialize edilmediyse etiket i18n'den gelir; materialize edildikten
// sonra kullanicinin verdigi duz `name` kullanilir.
//  NOT: Ust menudeki "Gereksinimler" sayfasi, PBS agacini (butun hiyerarsiyi
//  tek agacta, baglantilariyla birlikte) gosterdigi icin "Baglanti Agaci"
//  olarak yeniden adlandirildi (bkz. frontend i18n `nav.pbsTree`). Ayri bir
//  "Gereksinimler" grubu varsayilan olarak yalnizca Kullanici Gereksinimleri
//  (req-user) sayfasiyla geri eklendi; PM "+ Sayfa Ekle" ile System/
//  Sub-system sayfalarini da bu gruba ekleyebilir. Sayfa tipleri
//  NAV_PAGE_KEYS'te sabit kalir; gereksinim VERILERI etkilenmez.
export const DEFAULT_GROUPS = [
  {
    nameKey: 'nav.groupRequirements',
    name: 'Gereksinimler',
    order: 0,
    pageKeys: ['req-user'],
  },
  {
    nameKey: 'nav.groupTests',
    name: 'Testler',
    order: 1,
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
