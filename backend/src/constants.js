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
}
export const REQ_TYPES = Object.values(REQ_TYPE)

export const TEST_TYPE = {
  ACCEPTANCE: 'Acceptance Test',
  SYSTEM: 'System Test',
  SUBSYSTEM: 'Sub-system Test',
}
export const TEST_TYPES = Object.values(TEST_TYPE)

export const PRIORITY = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }
export const STATUS = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved', // Passed
  REJECTED: 'Rejected', // Failed
}
export const DAL = { A: 'DAL A', B: 'DAL B', C: 'DAL C', D: 'DAL D', E: 'DAL E' }

export const LINK_TYPE = {
  SATISFIES: 'Satisfies',
  VERIFIES: 'Verifies',
  ASSIGNED_TO: 'Assigned To',
}

// text_id on ekleri
export const TYPE_PREFIX = {
  [REQ_TYPE.USER]: 'REQ-USR',
  [REQ_TYPE.SYSTEM]: 'REQ-SYS',
  [REQ_TYPE.SOFTWARE]: 'REQ-SW',
  [REQ_TYPE.HARDWARE]: 'REQ-HW',
  [TEST_TYPE.ACCEPTANCE]: 'TC-ACC',
  [TEST_TYPE.SYSTEM]: 'TC-SYS',
  [TEST_TYPE.SUBSYSTEM]: 'TC-SUB',
}

// --- Satisfies kurallari (from = UST, to = ALT) ----------------------------
//  User  <- System           (System, User gereksinimini karsilar)
//  System <- Software/Hardware(Sub-system, System gereksinimini karsilar)
export const SATISFIES_PARENT_OF = {
  [REQ_TYPE.SYSTEM]: REQ_TYPE.USER,          // System'in ust'u User
  [REQ_TYPE.SOFTWARE]: REQ_TYPE.SYSTEM,      // SW'nin ust'u System
  [REQ_TYPE.HARDWARE]: REQ_TYPE.SYSTEM,      // HW'nin ust'u System
}

// --- Verifies kurallari: her test tipi SADECE belirli gereksinim tip(ler)ini
//     dogrulayabilir (strict hierarchy). ---------------------------------------
export const VERIFIES_TARGET_TYPES = {
  [TEST_TYPE.ACCEPTANCE]: [REQ_TYPE.USER],
  [TEST_TYPE.SYSTEM]: [REQ_TYPE.SYSTEM],
  [TEST_TYPE.SUBSYSTEM]: [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
}

// Glossary 'Assigned To' ile hangi gereksinim tiplerine baglanabilir.
export const ASSIGNABLE_REQ_TYPES = [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE]

// Kapsam (coverage) analizine dahil edilen gereksinim tipleri.
export const COVERABLE_TYPES = [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE]
