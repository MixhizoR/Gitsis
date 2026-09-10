// ============================================================================
//  constants.js  —  Backend tarafi taksonomi ve is kurallari (tek kaynak).
//  Yeni hiyerarsi: User -> System -> Sub-system (Software / Hardware)
//  Testler: Acceptance (User) / System (System) / Sub-system (SW-HW)
// ============================================================================

export const REQ_TYPE = {
  USER: 'User Requirement',
  SYSTEM: 'System Requirement',
  SOFTWARE: 'Software Requirement',
  HARDWARE: 'Hardware Requirement',
};
export const REQ_TYPES = Object.values(REQ_TYPE);

export const TEST_TYPE = {
  ACCEPTANCE: 'Acceptance Test',
  SYSTEM: 'System Test',
  SUBSYSTEM: 'Sub-system Test',
};
export const TEST_TYPES = Object.values(TEST_TYPE);

// --- Roller -------------------------------------------------------------------
//  PM rolü SERBEST METIN (User.role) icinde tutulur; isPM tespiti tum
//  katmanlarda bu sabit uzerinden yapilir (login/refresh isPM, cascade,
//  requirePM). DEGER UI (UsersPage, AuthContext) ile BIREBIR AYNI olmalidir.
export const PM_ROLE = 'Proje Yöneticisi';

export const PRIORITY = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const STATUS = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved', // Passed
  REJECTED: 'Rejected', // Failed
};
export const DAL = { A: 'DAL A', B: 'DAL B', C: 'DAL C', D: 'DAL D', E: 'DAL E' };

export const LINK_TYPE = {
  SATISFIES: 'Satisfies',
  VERIFIES: 'Verifies',
  ASSIGNED_TO: 'Assigned To',
};

// text_id on ekleri
// --- text_id onek semasi ----------------------------------------------------
//  Yapi: <codePrefix>-<TIP>-<NNN>     ornek: EH-KAHVE-TİD-USR-001
//  codePrefix PROJE bazlidir (Project.codePrefix); tip segmenti asagidadir.
export const DEFAULT_CODE_PREFIX = 'EH-KAHVE-TİD';

export const TYPE_SUFFIX = {
  [REQ_TYPE.USER]: 'USR',
  [REQ_TYPE.SYSTEM]: 'SYS',
  [REQ_TYPE.SOFTWARE]: 'SW',
  [REQ_TYPE.HARDWARE]: 'HW',
  [TEST_TYPE.ACCEPTANCE]: 'TC-ACC',
  [TEST_TYPE.SYSTEM]: 'TC-SYS',
  [TEST_TYPE.SUBSYSTEM]: 'TC-SUB',
  glossary: 'GLO',
};

/** Bir proje + tip icin tam onek: "EH-KAHVE-TİD-USR" */
export const prefixFor = (codePrefix, type) => `${codePrefix || DEFAULT_CODE_PREFIX}-${TYPE_SUFFIX[type] || 'GEN'}`;

// --- Satisfies kurallari (from = UST, to = ALT) ----------------------------
//  User  <- System           (System, User gereksinimini karsilar)
//  System <- Software/Hardware(Sub-system, System gereksinimini karsilar)
//  Bu, PBS AGACININ (Requirement.parentId, tek-ebeveynli adjacency-list)
//  TEK gecerli ust tipini belirler — agacta bir dugumun birden fazla ebeveyni
//  olamaz, bu yuzden burada TEK deger kalir. bkz. logic.js validateParentType.
export const SATISFIES_PARENT_OF = {
  [REQ_TYPE.SYSTEM]: REQ_TYPE.USER, // System'in ust'u User
  [REQ_TYPE.SOFTWARE]: REQ_TYPE.SYSTEM, // SW'nin ust'u System
  [REQ_TYPE.HARDWARE]: REQ_TYPE.SYSTEM, // HW'nin ust'u System
};

// --- Satisfies IZLENEBILIRLIK BAGI kurallari (TraceabilityLink, LinkManager) -
//  PBS agacinin aksine bir TraceabilityLink grafiginde bir gereksinimin
//  BIRDEN FAZLA gecerli ust tipi olabilir: Software/Hardware, normalde bir
//  System Requirement'i karsilar, ama arada ayri bir System Requirement
//  tanimlanmamissa DOGRUDAN bir User Requirement'i da karsilayabilir
//  ("skip-level" bag). System'in tek gecerli ustu hala User'dir (atlayacagi
//  bir ust seviye yok). bkz. logic.js validateLink.
export const SATISFIES_ALLOWED_PARENTS = {
  [REQ_TYPE.SYSTEM]: [REQ_TYPE.USER],
  [REQ_TYPE.SOFTWARE]: [REQ_TYPE.SYSTEM, REQ_TYPE.USER],
  [REQ_TYPE.HARDWARE]: [REQ_TYPE.SYSTEM, REQ_TYPE.USER],
};

// --- Verifies kurallari: her test tipi SADECE belirli gereksinim tip(ler)ini
//     dogrulayabilir (strict hierarchy). ---------------------------------------
export const VERIFIES_TARGET_TYPES = {
  [TEST_TYPE.ACCEPTANCE]: [REQ_TYPE.USER],
  [TEST_TYPE.SYSTEM]: [REQ_TYPE.SYSTEM],
  [TEST_TYPE.SUBSYSTEM]: [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
};

// Glossary 'Assigned To' ile hangi gereksinim tiplerine baglanabilir.
export const ASSIGNABLE_REQ_TYPES = [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE];

// Kapsam (coverage) analizine dahil edilen gereksinim tipleri.
export const COVERABLE_TYPES = [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE];

// --- Izin bileseni (permission component) eslemesi --------------------------
//  Her gereksinim/test, izin panellerindeki 6 bilesenden birine dusurulur.
//  Anahtarlar frontend REQ_PAGES / TEST_PAGES sayfa anahtarlariyla ayni.
//  TEK KAYNAK: server.js ve comments.js ayni esleme uzerinden yetki denetler.
export function componentKeyOf(entityType, type) {
  if (entityType === 'requirement') {
    if (type === 'User Requirement') return 'req-user';
    if (type === 'System Requirement') return 'req-system';
    return 'req-subsystem'; // Software / Hardware
  }
  if (type === 'Acceptance Test') return 'test-acceptance';
  if (type === 'System Test') return 'test-system';
  return 'test-subsystem';
}
