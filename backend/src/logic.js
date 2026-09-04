// ============================================================================
//  logic.js  —  Bag dogrulama + otomatik/cascade durum hesabi (saf mantik).
//  Hem seed hem de API bu tek kaynaktan beslenir.
// ============================================================================
import {
  REQ_TYPE,
  TEST_TYPE,
  STATUS,
  LINK_TYPE,
  SATISFIES_PARENT_OF,
  VERIFIES_TARGET_TYPES,
  ASSIGNABLE_REQ_TYPES,
} from './constants.js';

/**
 * Bir bagin kurulup kurulamayacagini dogrular.
 * @param {object} from  ust nesne (gereksinim)  { id, type }
 * @param {object} to    alt nesne (gereksinim / test / glossary) { id, type }
 * @param {string} type  LINK_TYPE
 * @param {string} toKind 'requirement' | 'test' | 'glossary'
 */
export function validateLink(from, to, type, toKind) {
  if (!from || !to) return { ok: false, error: 'Gecersiz secim.' };
  if (from.id === to.id) return { ok: false, error: 'Bir nesne kendine baglanamaz.' };

  if (type === LINK_TYPE.SATISFIES) {
    // to = ALT gereksinim (System / SW / HW), from = ust gereksinim
    const expectedParent = SATISFIES_PARENT_OF[to.type];
    if (!expectedParent) return { ok: false, error: `"${to.type}" bir Satisfies bagi baslatamaz.` };
    if (from.type !== expectedParent) {
      return { ok: false, error: `"${to.type}" yalnizca "${expectedParent}" ile Satisfies bagi kurabilir.` };
    }
    return { ok: true };
  }

  if (type === LINK_TYPE.VERIFIES) {
    // from = gereksinim, to = test
    if (toKind !== 'test') return { ok: false, error: 'Verifies bagi hedefi bir test senaryosu olmalidir.' };
    const allowed = VERIFIES_TARGET_TYPES[to.type];
    if (!allowed) return { ok: false, error: `Bilinmeyen test tipi: ${to.type}.` };
    if (!allowed.includes(from.type)) {
      return {
        ok: false,
        error: `"${to.type}" yalnizca ${allowed.join(' / ')} tipini dogrulayabilir.`,
      };
    }
    return { ok: true };
  }

  if (type === LINK_TYPE.ASSIGNED_TO) {
    // from = gereksinim, to = glossary terimi
    if (toKind !== 'glossary') return { ok: false, error: 'Assigned To hedefi bir Glossary terimi olmalidir.' };
    if (!ASSIGNABLE_REQ_TYPES.includes(from.type)) {
      return { ok: false, error: 'Glossary yalnizca gereksinimlere atanabilir.' };
    }
    return { ok: true };
  }

  return { ok: false, error: 'Bilinmeyen bag tipi.' };
}

/**
 * PBS agaci (Issue #9): bir gereksinimin verilen ebeveyne baglanip
 * baglanamayacagini TIP kuralina gore dogrular (SATISFIES_PARENT_OF).
 * parentId = null (kok dugum) yalnizca User Requirement icin gecerlidir.
 *
 * TODO (Issue #9 / Adim 3): Tasima (move) / bolme (split) / birlestirme (merge)
 * endpoint'lerinde bu kontrol, dongusel tasima kontrolu (Recursive CTE) ve
 * parentId <-> Satisfies bagi senkronizasyonu ile birlikte tek bir atomik
 * transaction icinde uygulanacak. Bu adimda yalnizca saf dogrulama vardir;
 * hicbir cagri noktasina baglanmamistir.
 *
 * @param {object} child  { type }
 * @param {object|null} parent { id, type } — kok dugum icin null
 */
export function validateParentType(child, parent) {
  if (!child) return { ok: false, error: 'Gecersiz gereksinim.' };
  const expectedParent = SATISFIES_PARENT_OF[child.type];
  if (!parent) {
    if (expectedParent) return { ok: false, error: `"${child.type}" kok dugum olamaz; bir ust gereksinim gerekir.` };
    return { ok: true };
  }
  if (child.id && child.id === parent.id) return { ok: false, error: 'Bir gereksinim kendi ust dugumu olamaz.' };
  if (!expectedParent) return { ok: false, error: `"${child.type}" bir ust gereksinime baglanamaz.` };
  if (parent.type !== expectedParent) {
    return { ok: false, error: `"${child.type}" yalnizca "${expectedParent}" altinda yer alabilir.` };
  }
  return { ok: true };
}

/**
 * Bir gereksinimin otomatik durumunu, ona Verifies ile bagli test
 * senaryolarina gore hesaplar.
 *   - hicbir test bagli degil            -> 'In Review' (kilitli)
 *   - en az bir test 'Rejected' (Failed) -> 'Rejected'
 *   - bagli tum testler 'Approved'        -> 'Approved'
 *   - aksi (bekleyen/incelemede test var) -> 'In Review'
 * @param {string} reqId
 * @param {Array}  links      tum baglar
 * @param {Map}    testById   id -> test senaryosu
 */
export function computeRequirementStatus(reqId, links, testById) {
  const linkedTests = links
    .filter((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === reqId)
    .map((l) => testById.get(l.toId))
    .filter(Boolean);

  if (linkedTests.length === 0) return STATUS.IN_REVIEW;
  if (linkedTests.some((tc) => tc.status === STATUS.REJECTED)) return STATUS.REJECTED;
  if (linkedTests.every((tc) => tc.status === STATUS.APPROVED)) return STATUS.APPROVED;
  return STATUS.IN_REVIEW;
}

/**
 * Tum gereksinimlerin durumunu yeniden hesaplar (cascade).
 * @returns {{ id, from, to }[]} degisen gereksinimler
 */
export function recomputeAllStatuses(requirements, testCases, links) {
  const testById = new Map(testCases.map((t) => [t.id, t]));
  const changes = [];
  for (const r of requirements) {
    const next = computeRequirementStatus(r.id, links, testById);
    if (next !== r.status) changes.push({ id: r.id, text_id: r.text_id, from: r.status, to: next });
  }
  return changes;
}

export { REQ_TYPE, TEST_TYPE, STATUS, LINK_TYPE };
