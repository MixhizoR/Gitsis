// ============================================================================
//  constants.test.js — Saf taksonomi tutarliligi (Issue #69 / BP boelugu).
//  DB gerektirmez. constants.js tek kaynak olarak 9 test dosyasi tarafindan
//  da kullaniliyor; burada invariant korumasi yapiyoruz.
// ============================================================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REQ_TYPE,
  REQ_TYPES,
  TEST_TYPE,
  TEST_TYPES,
  PRIORITY,
  STATUS,
  DAL,
  LINK_TYPE,
  TYPE_PREFIX,
  SATISFIES_PARENT_OF,
  VERIFIES_TARGET_TYPES,
  ASSIGNABLE_REQ_TYPES,
  COVERABLE_TYPES,
} from '../src/constants.js';

test('REQ_TYPE: 4 sabit deger ve REQ_TYPES tumunu icerir', () => {
  assert.deepEqual(Object.keys(REQ_TYPE).sort(), ['HARDWARE', 'SOFTWARE', 'SYSTEM', 'USER']);
  assert.equal(REQ_TYPES.length, 4);
  assert.equal(new Set(REQ_TYPES).size, 4, 'tipler essiz olmali');
});

test('TEST_TYPE: 3 sabit deger ve TEST_TYPES tumunu icerir', () => {
  assert.deepEqual(Object.keys(TEST_TYPE).sort(), ['ACCEPTANCE', 'SUBSYSTEM', 'SYSTEM']);
  assert.equal(TEST_TYPES.length, 3);
  assert.equal(new Set(TEST_TYPES).size, 3);
});

test('REQ_TYPES <-> REQ_TYPE: deger seti ayni', () => {
  assert.deepEqual(new Set(REQ_TYPES), new Set(Object.values(REQ_TYPE)));
});

test('TEST_TYPES <-> TEST_TYPE: deger seti ayni', () => {
  assert.deepEqual(new Set(TEST_TYPES), new Set(Object.values(TEST_TYPE)));
});

test('TYPE_PREFIX: her REQ/TEST tipinin bir text_id on eki var', () => {
  for (const t of REQ_TYPES) assert.ok(TYPE_PREFIX[t], `Prefix eksik: ${t}`);
  for (const t of TEST_TYPES) assert.ok(TYPE_PREFIX[t], `Prefix eksik: ${t}`);
});

test('TYPE_PREFIX on ekleri tekil (REQ-USR, REQ-SYS, REQ-SW, REQ-HW, TC-*)', () => {
  const vals = Object.values(TYPE_PREFIX);
  assert.equal(new Set(vals).size, vals.length, 'Prefix tekrari olamaz');
  // Beklenen on ekler (donusum invariantlari)
  assert.equal(TYPE_PREFIX[REQ_TYPE.USER], 'REQ-USR');
  assert.equal(TYPE_PREFIX[REQ_TYPE.SYSTEM], 'REQ-SYS');
  assert.equal(TYPE_PREFIX[REQ_TYPE.SOFTWARE], 'REQ-SW');
  assert.equal(TYPE_PREFIX[REQ_TYPE.HARDWARE], 'REQ-HW');
  assert.equal(TYPE_PREFIX[TEST_TYPE.ACCEPTANCE], 'TC-ACC');
  assert.equal(TYPE_PREFIX[TEST_TYPE.SYSTEM], 'TC-SYS');
  assert.equal(TYPE_PREFIX[TEST_TYPE.SUBSYSTEM], 'TC-SUB');
});

test('SATISFIES_PARENT_OF: User disindaki her req tipinin ust tipi var', () => {
  // User hicbir zaman satisfies KAYNAGI olamaz (yukariga dogru akar)
  assert.ok(!SATISFIES_PARENT_OF[REQ_TYPE.USER], 'User ust olmamali');
  for (const t of [REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE]) {
    assert.ok(SATISFIES_PARENT_OF[t], `Parent eksik: ${t}`);
  }
  assert.equal(SATISFIES_PARENT_OF[REQ_TYPE.SYSTEM], REQ_TYPE.USER);
  assert.equal(SATISFIES_PARENT_OF[REQ_TYPE.SOFTWARE], REQ_TYPE.SYSTEM);
  assert.equal(SATISFIES_PARENT_OF[REQ_TYPE.HARDWARE], REQ_TYPE.SYSTEM);
});

test('VERIFIES_TARGET_TYPES: her test tipi sadece izinli req tiplerini dogrular', () => {
  // Acceptance test yalniz User'i dogrular (strict hierarchy)
  assert.deepEqual(VERIFIES_TARGET_TYPES[TEST_TYPE.ACCEPTANCE], [REQ_TYPE.USER]);
  // System test yalniz System'i
  assert.deepEqual(VERIFIES_TARGET_TYPES[TEST_TYPE.SYSTEM], [REQ_TYPE.SYSTEM]);
  // Sub-system test Software + Hardware
  assert.deepEqual(VERIFIES_TARGET_TYPES[TEST_TYPE.SUBSYSTEM], [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE]);
  // Her hedef REQ_TYPES icinde
  for (const targets of Object.values(VERIFIES_TARGET_TYPES)) {
    for (const t of targets) {
      assert.ok(REQ_TYPES.includes(t), `Hedef tip gecersiz: ${t}`);
    }
  }
});

test('ASSIGNABLE_REQ_TYPES ve COVERABLE_TYPES: REQ_TYPES ile ayni kume', () => {
  // Glossary "Assigned To" + coverage analizi tum req tiplerini kapsar
  assert.deepEqual(new Set(ASSIGNABLE_REQ_TYPES), new Set(REQ_TYPES));
  assert.deepEqual(new Set(COVERABLE_TYPES), new Set(REQ_TYPES));
});

test('LINK_TYPE: 3 sabit (Satisfies, Verifies, Assigned To)', () => {
  assert.deepEqual(Object.keys(LINK_TYPE).sort(), ['ASSIGNED_TO', 'SATISFIES', 'VERIFIES']);
});

test('PRIORITY / STATUS / DAL: enum invariantlari', () => {
  assert.equal(new Set(Object.values(PRIORITY)).size, 3);
  assert.equal(new Set(Object.values(STATUS)).size, 4);
  assert.equal(new Set(Object.values(DAL)).size, 5);
  // STATUS.APPROVED + REJECTED sabit isimler
  assert.equal(STATUS.APPROVED, 'Approved');
  assert.equal(STATUS.REJECTED, 'Rejected');
});
