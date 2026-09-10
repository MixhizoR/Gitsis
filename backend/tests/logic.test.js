import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ||= 'unit-test-jwt-secret';

const { validateLink, validateParentType, computeRequirementStatus, recomputeAllStatuses } =
  await import('../src/logic.js');
const { STATUS, LINK_TYPE, REQ_TYPE, TEST_TYPE } = await import('../src/constants.js');

const req = (id, type = REQ_TYPE.SYSTEM) => ({ id, type, text_id: `R-${id}` });
const tc = (id, status = STATUS.IN_REVIEW) => ({ id, status });
const link = (fromId, toId, type) => ({ fromId, toId, type });
const testMap = (tests) => new Map(tests.map((t) => [t.id, t]));

// --- validateLink -----------------------------------------------------------

test('validateLink: Verifies — System req → System test OK', () => {
  const from = req('a', REQ_TYPE.SYSTEM);
  const to = { id: 't1', type: TEST_TYPE.SYSTEM };
  assert.deepEqual(validateLink(from, to, LINK_TYPE.VERIFIES, 'test'), { ok: true });
});

test('validateLink: Verifies — yanlış test tipi reddedilir', () => {
  const from = req('a', REQ_TYPE.SYSTEM);
  const to = { id: 't1', type: TEST_TYPE.ACCEPTANCE };
  const r = validateLink(from, to, LINK_TYPE.VERIFIES, 'test');
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('validateLink: Verifies — toKind test değilse reddeder', () => {
  const from = req('a', REQ_TYPE.SYSTEM);
  const to = { id: 'g1', type: 'Glossary' };
  const r = validateLink(from, to, LINK_TYPE.VERIFIES, 'glossary');
  assert.equal(r.ok, false);
});

test('validateLink: kendine bağ reddedilir', () => {
  const from = req('a');
  const r = validateLink(from, from, LINK_TYPE.VERIFIES, 'test');
  assert.equal(r.ok, false);
});

test('validateLink: tanımsız bağ tipi reddedilir', () => {
  const from = req('a');
  const to = tc('t1');
  const r = validateLink(from, to, 'Unknown', 'test');
  assert.equal(r.ok, false);
});

// --- validateLink: Satisfies (top-down baslatma + skip-level) ---------------
//  Kullanıcı talebi: LinkManager artık (1) User Requirement'tan bir System
//  Requirement'ı "buna bağla" diyebilmeli (üstten başlatma) ve (2) bir
//  Sub-system (Software/Hardware) Requirement doğrudan bir User Requirement'ı
//  karşılayabilmeli (System'i atlayarak). validateLink, HANGİ tarafın
//  başlattığını bilmez — yalnızca (from.type, to.type) çiftinin
//  SATISFIES_ALLOWED_PARENTS'ta izinli olup olmadığını kontrol eder; bu
//  yüzden "üstten başlatma" ayrı bir test gerektirmez, aynı doğrulama.

test('validateLink: Satisfies — System req, User req’i karşılar (normal, adjacent-tier)', () => {
  const from = req('user-1', REQ_TYPE.USER);
  const to = req('sys-1', REQ_TYPE.SYSTEM);
  assert.deepEqual(validateLink(from, to, LINK_TYPE.SATISFIES, 'requirement'), { ok: true });
});

test('validateLink: Satisfies — Software req, System req’i karşılar (normal, adjacent-tier)', () => {
  const from = req('sys-1', REQ_TYPE.SYSTEM);
  const to = req('sw-1', REQ_TYPE.SOFTWARE);
  assert.deepEqual(validateLink(from, to, LINK_TYPE.SATISFIES, 'requirement'), { ok: true });
});

test('validateLink: Satisfies — Software req, System atlayıp DOĞRUDAN User req’i karşılayabilir (skip-level)', () => {
  const from = req('user-1', REQ_TYPE.USER);
  const to = req('sw-1', REQ_TYPE.SOFTWARE);
  assert.deepEqual(validateLink(from, to, LINK_TYPE.SATISFIES, 'requirement'), { ok: true });
});

test('validateLink: Satisfies — Hardware req de doğrudan User req’i karşılayabilir (skip-level)', () => {
  const from = req('user-1', REQ_TYPE.USER);
  const to = req('hw-1', REQ_TYPE.HARDWARE);
  assert.deepEqual(validateLink(from, to, LINK_TYPE.SATISFIES, 'requirement'), { ok: true });
});

test('validateLink: Satisfies — System req, System’i (kendi tipini) karşılayamaz', () => {
  const from = req('sys-a', REQ_TYPE.SYSTEM);
  const to = req('sys-b', REQ_TYPE.SYSTEM);
  const r = validateLink(from, to, LINK_TYPE.SATISFIES, 'requirement');
  assert.equal(r.ok, false);
});

test('validateLink: Satisfies — User req bir Satisfies bağı BAŞLATAMAZ (to=User geçersiz, tepe seviye)', () => {
  const from = req('sys-1', REQ_TYPE.SYSTEM);
  const to = req('user-1', REQ_TYPE.USER);
  const r = validateLink(from, to, LINK_TYPE.SATISFIES, 'requirement');
  assert.equal(r.ok, false);
});

// --- computeRequirementStatus -----------------------------------------------

test('computeRequirementStatus: bağlı test yok → In Review', () => {
  const status = computeRequirementStatus('r1', [], new Map());
  assert.equal(status, STATUS.IN_REVIEW);
});

test('computeRequirementStatus: en az bir Rejected → Rejected', () => {
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES), link('r1', 't2', LINK_TYPE.VERIFIES)];
  const testById = testMap([tc('t1', STATUS.APPROVED), tc('t2', STATUS.REJECTED)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.REJECTED);
});

test('computeRequirementStatus: tüm testler Approved → Approved', () => {
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES), link('r1', 't2', LINK_TYPE.VERIFIES)];
  const testById = testMap([tc('t1', STATUS.APPROVED), tc('t2', STATUS.APPROVED)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.APPROVED);
});

test('computeRequirementStatus: In Review karışık → In Review', () => {
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES)];
  const testById = testMap([tc('t1', STATUS.IN_REVIEW)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.IN_REVIEW);
});

test('computeRequirementStatus: Satisfies bağları dikkate alınmaz', () => {
  const links = [link('r1', 't1', LINK_TYPE.SATISFIES)];
  const testById = testMap([tc('t1', STATUS.APPROVED)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.IN_REVIEW);
});

// --- recomputeAllStatuses ---------------------------------------------------

test('recomputeAllStatuses: sadece değişenler döner (from/to/text_id)', () => {
  const requirements = [
    { id: 'r1', text_id: 'REQ-001', status: STATUS.IN_REVIEW },
    { id: 'r2', text_id: 'REQ-002', status: STATUS.APPROVED },
    { id: 'r3', text_id: 'REQ-003', status: STATUS.IN_REVIEW },
  ];
  const testCases = [tc('t1', STATUS.APPROVED)];
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES)];

  const changes = recomputeAllStatuses(requirements, testCases, links);
  // r1: In Review → Approved (değişti)
  // r2: Approved → In Review (bağ yok, değişti)
  // r3: In Review → In Review (bağ yok, değişmedi)
  assert.equal(changes.length, 2);
  const byId = Object.fromEntries(changes.map((c) => [c.id, c]));
  assert.equal(byId.r1.from, STATUS.IN_REVIEW);
  assert.equal(byId.r1.to, STATUS.APPROVED);
  assert.equal(byId.r2.from, STATUS.APPROVED);
  assert.equal(byId.r2.to, STATUS.IN_REVIEW);
  assert.equal(byId.r1.text_id, 'REQ-001');
});

test('recomputeAllStatuses: hiç değişim yoksa boş döner', () => {
  const requirements = [
    { id: 'r1', text_id: 'REQ-001', status: STATUS.IN_REVIEW },
    { id: 'r2', text_id: 'REQ-002', status: STATUS.IN_REVIEW },
  ];
  const testCases = [];
  const links = [];
  assert.deepEqual(recomputeAllStatuses(requirements, testCases, links), []);
});

// --- validateParentType (PBS ağacı, Issue #9) --------------------------------

test('validateParentType: System → User altında olabilir', () => {
  assert.deepEqual(validateParentType(req('c', REQ_TYPE.SYSTEM), req('p', REQ_TYPE.USER)), { ok: true });
});

test('validateParentType: Software → System altında olabilir, User altında olamaz', () => {
  assert.equal(validateParentType(req('c', REQ_TYPE.SOFTWARE), req('p', REQ_TYPE.SYSTEM)).ok, true);
  assert.equal(validateParentType(req('c', REQ_TYPE.SOFTWARE), req('p', REQ_TYPE.USER)).ok, false);
});

test('validateParentType: User kök düğüm olabilir, System olamaz', () => {
  assert.equal(validateParentType(req('c', REQ_TYPE.USER), null).ok, true);
  assert.equal(validateParentType(req('c', REQ_TYPE.SYSTEM), null).ok, false);
});

test('validateParentType: bir gereksinim kendi üst düğümü olamaz', () => {
  const self = req('same', REQ_TYPE.SYSTEM);
  const r = validateParentType(self, { id: 'same', type: REQ_TYPE.USER });
  assert.equal(r.ok, false);
  assert.ok(r.error);
});
