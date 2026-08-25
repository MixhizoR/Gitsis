import assert from 'node:assert/strict';
import { test } from 'node:test';

// auth.js modul yuklenirken JWT_SECRET kontrolu yapilir; yuzunden once
// env'yi ayarliyoruz, sonra dinamik import ile auth.js'i yukluyoruz.
// (api.test.js ile ayni pattern.)
process.env.JWT_SECRET ||= 'unit-test-jwt-secret';

const { hashPassword, verifyPassword } = await import('../src/auth.js');

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
  // assert.doesNotThrow async callback'u beklemez; dogrudan await yapip
  // assertionlari kontrol ederiz — exception firlatmaz ama ok:false bekliyoruz.
  const { ok, migrated } = await verifyPassword('kisa', 'cok daha uzun bir sifre degeri');
  assert.equal(ok, false);
  assert.equal(migrated, true);
});

test('verifyPassword: non-string girdi (undefined/null) ok: false, auth bypass yok', async () => {
  // Eski kod: undefined === null -> false. Yeni kod da false vermeli;
  // aksi halde '' === '' -> true olurdu (potansiyel bypass).
  const u = await verifyPassword(undefined, 'sifre');
  assert.equal(u.ok, false);
  const n = await verifyPassword(null, null);
  assert.equal(n.ok, false);
  const bothNull = await verifyPassword(undefined, null);
  assert.equal(bothNull.ok, false);
});

test('verifyPassword: bcrypt hashli kayit migrated: false ve dogru sifre verified olur', async () => {
  const hash = await hashPassword('gizli-parola');
  const { ok, migrated } = await verifyPassword('gizli-parola', hash);
  assert.equal(ok, true);
  assert.equal(migrated, false);
  const yanlis = await verifyPassword('yanlis', hash);
  assert.equal(yanlis.ok, false);
  assert.equal(yanlis.migrated, false);
});
