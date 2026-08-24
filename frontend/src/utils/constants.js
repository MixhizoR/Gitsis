// ============================================================================
//  constants.js
//  Uygulama genelinde kullanilan sabit deger setleri (enum benzeri).
//  Tum dropdown / filtre / rozet bilesenleri bu tek kaynaktan beslenir.
// ============================================================================

// --- Gereksinim tipleri -----------------------------------------------------
//  Yeni hiyerarsi: User -> System -> Sub-system (Software / Hardware).
//  (TEST_CASE geriye donuk uyumluluk icin korunur; testler artik ayri
//   TEST_TYPE taksonomisinde ve ayri bir koleksiyonda tutulur.)
export const REQ_TYPE = {
  USER: 'User Requirement',
  SYSTEM: 'System Requirement',
  SOFTWARE: 'Software Requirement',
  HARDWARE: 'Hardware Requirement',
  TEST_CASE: 'Test Case',
}

// Gerçek gereksinim tipleri (test haric) — hiyerarsi sayfalari icin.
export const HIERARCHY_REQ_TYPES = [
  REQ_TYPE.USER,
  REQ_TYPE.SYSTEM,
  REQ_TYPE.SOFTWARE,
  REQ_TYPE.HARDWARE,
]
export const REQ_TYPES = HIERARCHY_REQ_TYPES

// --- Test tipleri (ayri koleksiyon) ----------------------------------------
export const TEST_TYPE = {
  ACCEPTANCE: 'Acceptance Test',
  SYSTEM: 'System Test',
  SUBSYSTEM: 'Sub-system Test',
}
export const TEST_TYPES = Object.values(TEST_TYPE)

// --- Bag mantigi (frontend dogrulamasi; backend de ayni kurali uygular) -----
//  Satisfies: to = ALT gereksinim, from = UST gereksinim.
export const SATISFIES_PARENT_OF = {
  [REQ_TYPE.SYSTEM]: REQ_TYPE.USER,
  [REQ_TYPE.SOFTWARE]: REQ_TYPE.SYSTEM,
  [REQ_TYPE.HARDWARE]: REQ_TYPE.SYSTEM,
}
//  Verifies: her test tipi SADECE su gereksinim tipini dogrular.
export const VERIFIES_TARGET_TYPES = {
  [TEST_TYPE.ACCEPTANCE]: [REQ_TYPE.USER],
  [TEST_TYPE.SYSTEM]: [REQ_TYPE.SYSTEM],
  [TEST_TYPE.SUBSYSTEM]: [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
}
export const ASSIGNABLE_REQ_TYPES = [
  REQ_TYPE.USER,
  REQ_TYPE.SYSTEM,
  REQ_TYPE.SOFTWARE,
  REQ_TYPE.HARDWARE,
]

// --- Gereksinim alani / disiplini (Category / Domain) -----------------------
// 10 sistem gereksiniminin alt gereksinimlere ayristirilmasinda, her alt
// gereksinimin hangi muhendislik disiplinine ait oldugunu belirtir.
// (DOORS'taki "Object Attribute" mantiginin sadelestirilmis karsiligi.)
export const CATEGORY = {
  HMI: 'Arayuz / HMI',
  SOFTWARE: 'Yazilim / Kontrol',
  HARDWARE: 'Donanim',
  DATABASE: 'Veritabani',
  SERVER: 'Sunucu / Altyapi',
  COMMS: 'Haberlesme',
  SAFETY: 'Guvenlik / Emniyet',
  PERFORMANCE: 'Performans',
  GENERAL: 'Genel',
}
export const CATEGORIES = Object.values(CATEGORY)

// text_id on eki: tip -> kod prefix eslesmesi (Orn: REQ-SYS-001)
export const TYPE_PREFIX = {
  [REQ_TYPE.USER]: 'REQ-USR',
  [REQ_TYPE.SYSTEM]: 'REQ-SYS',
  [REQ_TYPE.SOFTWARE]: 'REQ-SW',
  [REQ_TYPE.HARDWARE]: 'REQ-HW',
  [REQ_TYPE.TEST_CASE]: 'REQ-TC',
  [TEST_TYPE.ACCEPTANCE]: 'TC-ACC',
  [TEST_TYPE.SYSTEM]: 'TC-SYS',
  [TEST_TYPE.SUBSYSTEM]: 'TC-SUB',
}

// --- Oncelik ----------------------------------------------------------------
export const PRIORITY = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}
export const PRIORITIES = Object.values(PRIORITY)

// --- Durum ------------------------------------------------------------------
export const STATUS = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}
export const STATUSES = Object.values(STATUS)

// --- DO-178C Tasarim Guvence Seviyeleri (DAL) -------------------------------
export const DAL = {
  A: 'DAL A',
  B: 'DAL B',
  C: 'DAL C',
  D: 'DAL D',
  E: 'DAL E',
}
export const DAL_LEVELS = Object.values(DAL)

// DAL kritiklik agirligi (A en kritik). Kapsam raporunda siralama icin.
export const DAL_WEIGHT = {
  [DAL.A]: 5,
  [DAL.B]: 4,
  [DAL.C]: 3,
  [DAL.D]: 2,
  [DAL.E]: 1,
}

// --- Izlenebilirlik bag tipleri ---------------------------------------------
//  DO-178C izlenebilirlik yonu (DEPOLAMA YONU sabittir):
//    fromId = UST seviye / dogrulanan gereksinim   (parent)
//    toId   = ALT seviye nesne (satisfier / test)  (child)
//
//  SATISFIES : (ust) System Requirement  <- (alt) Software / Hardware Requirement
//              "Yazilim/Donanim gereksinimi, sistem gereksinimini KARSILAR."
//  VERIFIES  : (ust) System/Software/Hardware Req <- (alt) Test Case
//              "Test senaryosu, gereksinimi DOGRULAR."
//
//  ONEMLI: Bag her zaman ALTTAKI bilesenden (SW/HW veya TC) baslatilir; ust
//  seviye System gereksinimi hicbir bagi yukari dogru baslatamaz (tepe seviye).
//  Baslatma kurallari icin asagidaki LINK_INITIATION tablosuna bakiniz.
export const LINK_TYPE = {
  SATISFIES: 'Satisfies',
  VERIFIES: 'Verifies',
  ASSIGNED_TO: 'Assigned To',
}
export const LINK_TYPES = Object.values(LINK_TYPE)

// Bag kurallari (DEPOLAMA dogrulamasi): from = ust gereksinim, to = alt nesne.
//  Not: Asil dogrulama backend/src/logic.js icinde yapilir; bu tablo yalnizca
//  UI etiketleri ve genel yon bilgisi icindir.
export const LINK_RULES = {
  [LINK_TYPE.SATISFIES]: {
    label: 'Satisfies (Karsilar)',
    from: [REQ_TYPE.USER, REQ_TYPE.SYSTEM],
    to: [REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
    fromLabel: 'User / System Requirement',
    toLabel: 'System / Software / Hardware Requirement',
  },
  [LINK_TYPE.VERIFIES]: {
    label: 'Verifies (Dogrular)',
    from: [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
    to: TEST_TYPES,
    fromLabel: 'User / System / Software / Hardware Requirement',
    toLabel: 'Test Case',
  },
  [LINK_TYPE.ASSIGNED_TO]: {
    label: 'Assigned To (Atanmis)',
    from: [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
    to: ['Glossary Term'],
    fromLabel: 'User / System / Sub-system Requirement',
    toLabel: 'Glossary Term',
  },
}

// ---------------------------------------------------------------------------
//  BAG BASLATMA TABLOSU (bottom-up).
//  Anahtar = bagi BASLATAN (modali acik olan) gereksinimin tipi.
//  Her secenek, kullanicinin secebilecegi HEDEF tipleri ve olusacak bagin
//  depolama yonunu tanimlar:
//     storeAs: 'child'    -> link(target=UST, open=ALT)  (Satisfies)
//     storeAs: 'verifier' -> link(target=UST, open=ALT)  (Verifies; open = TC)
//  Her iki durumda da DEPOLAMA: fromId = hedef (ust), toId = acik gereksinim (alt).
// ---------------------------------------------------------------------------
export const LINK_INITIATION = {
  [REQ_TYPE.SYSTEM]: [], // tepe seviye: yukari bag baslatmaz
  [REQ_TYPE.SOFTWARE]: [
    {
      type: LINK_TYPE.SATISFIES,
      targetTypes: [REQ_TYPE.SYSTEM],
      storeAs: 'child',
      label: 'Karsiladigi Sistem Gereksinimi (Satisfies ↑)',
      targetLabel: 'System Requirement',
    },
  ],
  [REQ_TYPE.HARDWARE]: [
    {
      type: LINK_TYPE.SATISFIES,
      targetTypes: [REQ_TYPE.SYSTEM],
      storeAs: 'child',
      label: 'Karsiladigi Sistem Gereksinimi (Satisfies ↑)',
      targetLabel: 'System Requirement',
    },
  ],
  [REQ_TYPE.TEST_CASE]: [
    {
      type: LINK_TYPE.VERIFIES,
      targetTypes: [REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
      storeAs: 'verifier',
      label: 'Dogruladigi Gereksinim (Verifies ↑)',
      targetLabel: 'System / Software / Hardware Requirement',
    },
  ],
}

// Kapsam (coverage) analizine dahil edilen gereksinim tipleri.
// (Sistem + Yazilim; Donanim kapsam skoruna dahil edilmez, ancak otomatik
//  durum hesabinda ve Verifies baglarinda yer alabilir.)
// Test ile dogrulanabilen (Verifies hedefi olabilen) TUM gereksinim tipleri.
// Kabul testi -> Kullanici, Sistem testi -> Sistem, Alt-sistem testi -> Yazilim/Donanim.
// Boylece kapsam paydasi TOPLAM gereksinim sayisidir (or. 58), 36 degil.
export const COVERABLE_TYPES = [
  REQ_TYPE.USER,
  REQ_TYPE.SYSTEM,
  REQ_TYPE.SOFTWARE,
  REQ_TYPE.HARDWARE,
]

// Ust gereksinime (Satisfies) baglanmasi GEREKEN tipler. Kullanici en tepe
// oldugu icin ust bag gerektirmez; digerleri bir ust seviyeyi karsilamalidir.
export const SATISFY_REQUIRED_TYPES = [REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE]

// --- Renk / stil eslemeleri (Tailwind sinif setleri) ------------------------
export const STATUS_STYLES = {
  [STATUS.DRAFT]:
    'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  [STATUS.IN_REVIEW]:
    'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60',
  [STATUS.APPROVED]:
    'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800/60',
  [STATUS.REJECTED]:
    'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60',
}

export const PRIORITY_STYLES = {
  [PRIORITY.HIGH]:
    'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60',
  [PRIORITY.MEDIUM]:
    'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60',
  [PRIORITY.LOW]:
    'bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800/60',
}

export const TYPE_STYLES = {
  [REQ_TYPE.USER]:
    'bg-indigo-100 text-indigo-800 ring-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800/60',
  [REQ_TYPE.SYSTEM]:
    'bg-violet-100 text-violet-800 ring-violet-300 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-800/60',
  [REQ_TYPE.SOFTWARE]:
    'bg-brand-100 text-brand-800 ring-brand-300 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800/60',
  [REQ_TYPE.HARDWARE]:
    'bg-teal-100 text-teal-800 ring-teal-300 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-800/60',
  [REQ_TYPE.TEST_CASE]:
    'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-300 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 dark:ring-fuchsia-800/60',
  // Test tipleri
  [TEST_TYPE.ACCEPTANCE]:
    'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-300 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 dark:ring-fuchsia-800/60',
  [TEST_TYPE.SYSTEM]:
    'bg-purple-100 text-purple-800 ring-purple-300 dark:bg-purple-950/50 dark:text-purple-300 dark:ring-purple-800/60',
  [TEST_TYPE.SUBSYSTEM]:
    'bg-pink-100 text-pink-800 ring-pink-300 dark:bg-pink-950/50 dark:text-pink-300 dark:ring-pink-800/60',
  // Sozluk terimi
  'Glossary Term':
    'bg-cyan-100 text-cyan-800 ring-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-800/60',
}

export const DAL_STYLES = {
  [DAL.A]: 'bg-rose-600 text-white ring-rose-700',
  [DAL.B]: 'bg-orange-500 text-white ring-orange-600',
  [DAL.C]: 'bg-amber-500 text-white ring-amber-600',
  [DAL.D]: 'bg-emerald-500 text-white ring-emerald-600',
  [DAL.E]: 'bg-slate-400 text-white ring-slate-500',
}

export const CATEGORY_STYLES = {
  [CATEGORY.HMI]:
    'bg-pink-100 text-pink-800 ring-pink-300 dark:bg-pink-950/50 dark:text-pink-300 dark:ring-pink-800/60',
  [CATEGORY.SOFTWARE]:
    'bg-brand-100 text-brand-800 ring-brand-300 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800/60',
  [CATEGORY.HARDWARE]:
    'bg-teal-100 text-teal-800 ring-teal-300 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-800/60',
  [CATEGORY.DATABASE]:
    'bg-indigo-100 text-indigo-800 ring-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800/60',
  [CATEGORY.SERVER]:
    'bg-cyan-100 text-cyan-800 ring-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-800/60',
  [CATEGORY.COMMS]:
    'bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800/60',
  [CATEGORY.SAFETY]:
    'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60',
  [CATEGORY.PERFORMANCE]:
    'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60',
  [CATEGORY.GENERAL]:
    'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
}

// Dashboard kirilim cubuklari icin sade kategori renkleri.
export const CATEGORY_BAR = {
  [CATEGORY.HMI]: 'bg-pink-500',
  [CATEGORY.SOFTWARE]: 'bg-brand-500',
  [CATEGORY.HARDWARE]: 'bg-teal-500',
  [CATEGORY.DATABASE]: 'bg-indigo-500',
  [CATEGORY.SERVER]: 'bg-cyan-500',
  [CATEGORY.COMMS]: 'bg-sky-500',
  [CATEGORY.SAFETY]: 'bg-rose-500',
  [CATEGORY.PERFORMANCE]: 'bg-amber-500',
  [CATEGORY.GENERAL]: 'bg-slate-400',
}

// ---------------------------------------------------------------------------
//  HIYERARSI SAYFA YAPILANDIRMASI
//  Sidebar "Hiyerarsi" alt sayfalari ve her sayfanin davranisi (kilitli tip,
//  ekleme butonu metni, tip secenekleri) tek kaynaktan surulur.
// ---------------------------------------------------------------------------
export const REQ_PAGES = {
  'req-user': {
    key: 'req-user',
    label: 'User Requirements',
    navLabel: 'Kullanici Gereksinimleri',
    lockedType: REQ_TYPE.USER, // tip kilitli
    typeOptions: [REQ_TYPE.USER],
    addLabel: 'Kullanici Gereksinimi Ekle',
  },
  'req-system': {
    key: 'req-system',
    label: 'System Requirements',
    navLabel: 'Sistem Gereksinimleri',
    lockedType: REQ_TYPE.SYSTEM,
    typeOptions: [REQ_TYPE.SYSTEM],
    addLabel: 'Sistem Gereksinimi Ekle',
  },
  'req-subsystem': {
    key: 'req-subsystem',
    label: 'Sub-system Requirements',
    navLabel: 'Alt Sistem Gereksinimleri',
    lockedType: null, // SW/HW arasinda secim
    typeOptions: [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
    addLabel: 'Alt Sistem Gereksinimi Ekle',
  },
}

export const TEST_PAGES = {
  'test-acceptance': {
    key: 'test-acceptance',
    label: 'Acceptance Test',
    navLabel: 'Kabul Testleri',
    lockedType: TEST_TYPE.ACCEPTANCE,
    verifiesTypes: VERIFIES_TARGET_TYPES[TEST_TYPE.ACCEPTANCE], // [User]
    addLabel: 'Test Senaryosu Ekle',
  },
  'test-system': {
    key: 'test-system',
    label: 'System Test',
    navLabel: 'Sistem Testleri',
    lockedType: TEST_TYPE.SYSTEM,
    verifiesTypes: VERIFIES_TARGET_TYPES[TEST_TYPE.SYSTEM], // [System]
    addLabel: 'Test Senaryosu Ekle',
  },
  'test-subsystem': {
    key: 'test-subsystem',
    label: 'Sub-system Test',
    navLabel: 'Alt Sistem Testleri',
    lockedType: TEST_TYPE.SUBSYSTEM,
    verifiesTypes: VERIFIES_TARGET_TYPES[TEST_TYPE.SUBSYSTEM], // [Software, Hardware]
    addLabel: 'Test Senaryosu Ekle',
  },
}

// Test durumu icin izin verilen elle secilebilir degerler (bag kurulurken).
// Persist edilen degerler cevrilmez.
export const TEST_STATUS_OPTIONS = [STATUS.APPROVED, STATUS.REJECTED, STATUS.IN_REVIEW]
// Kullaniciya gosterilen Turkce etiketler (deger degismez).
export const TEST_STATUS_LABELS = {
  [STATUS.APPROVED]: 'Passed (Basarili)',
  [STATUS.REJECTED]: 'Failed (Basarisiz)',
  [STATUS.IN_REVIEW]: 'In Review (Incelemede)',
}

// Oturum acan kullanici (auth katmani MVP'de yok; tek kullanici simulasyonu).
export const CURRENT_USER = 'ehsim.user'
