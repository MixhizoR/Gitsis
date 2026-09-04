// ============================================================================
//  verify-password.test.js — Saf auth regression (Issue #69 / BP-7).
//  bcrypt hash'i before()'da bir kez uretilir, tum testler paylasir (5×100ms tasarrufu).
// ============================================================================
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
// Ortak env setup (DB gerektirmez).
import './_setup.js';

const { hashPassword, verifyPassword } = await import('../src/auth.js');

let BCRYPT_HASH; // before()'da bir kez uretilir, 4 testte paylasilir.

before(async () => {
  BCRYPT_HASH = await hashPassword('gizli-parola');
});

test('verifyPassword: eski duz-metin eslesme ok: true, migrated: true (timing-safe)', async () => {
  const { ok, migrated } = await verifyPassword('sifrem123', 'sifrem123');
  assert.equal(ok, true);
  assert.equal(migrated, true);
});

test('verifyPassword: farkli ama ayni uzunlukta duz-metin ok: false (hic exception yok)', async () => {
  const { ok, migrated } = await verifyPassword('sifrem123', 'yanlis1234');
  assert.equal(ok, false);
  assert.equal(migrated, true);
});

test('verifyPassword: farkli uzunluk farkli duz-metin ok: false, exception firlatmaz', async () => {
  const { ok, migrated } = await verifyPassword('kisa', 'cok daha uzun bir sifre degeri');
  assert.equal(ok, false);
  assert.equal(migrated, true);
});

test('verifyPassword: non-string girdi (undefined/null) ok: false, auth bypass yok', async () => {
  const u = await verifyPassword(undefined, 'sifre');
  assert.equal(u.ok, false);
  const n = await verifyPassword(null, null);
  assert.equal(n.ok, false);
  const bothNull = await verifyPassword(undefined, null);
  assert.equal(bothNull.ok, false);
});

test('verifyPassword: bcrypt hashli kayit migrated: false ve dogru sifre verified olur', async () => {
  // onceki halinde bu testte yeniden hashPassword('gizli-parola') cagiriliyordu;
  // before()'da paylasilan BCRYPT_HASH kullanilir (~100ms tasarrufu).
  const { ok, migrated } = await verifyPassword('gizli-parola', BCRYPT_HASH);
  assert.equal(ok, true);
  assert.equal(migrated, false);
  const yanlis = await verifyPassword('yanlis', BCRYPT_HASH);
  assert.equal(yanlis.ok, false);
  assert.equal(yanlis.migrated, false);
});
