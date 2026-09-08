// ============================================================================
//  issue86-auth-lockout.test.js — Issue #86: Backend Auth endpoint'leri ve
//  hesap kilidi (brute-force korumasi) dogrulama testleri.
//  Kapsam:
//    1) Login -> accessToken + refreshToken dondurur; Bearer erisim tokeni
//       ile korunan bir uca erisilir (AC #1).
//    2) 5 basarisiz giris -> hesap kilitlenir (failedAttempts=5 +
//       lockedUntil); dogru sifreyle bile 6. denemede 423 doner (AC #2).
//    3) Refresh: eski token revoke olur, yeni access+refresh cifti uretilir;
//       eski token tekrar kullanilirsa 401 (rotasyon, AC #3).
//    4) Logout: refresh token DB'de revoke edilir (AC #4).
//    5) Auth olaylari SystemAuditLog'a yazilir (AC #5).
//    6) Refresh/logout ayri (login'den daha yuksek) bir limit kullanir:
//       21. istek 429 degil (AC #6 bileseni).
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
// Ortak env + DB reset yardimcisi (tek dogruluk kaynagi: tests/_setup.js).
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM = { username: 'pm-issue86', password: 'pm-pass-1234' };
const LOCK = { username: 'lock-user86', password: 'lock-pass-1234' };

before(async () => {
  resetDb();

  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: PM.username,
      passwordHash: await hashPassword(PM.password),
      name: 'Issue86 PM',
      role: 'Proje Yoneticisi',
      systemRole: 'ADMIN',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  await prisma.user.create({
    data: {
      username: LOCK.username,
      passwordHash: await hashPassword(LOCK.password),
      name: 'Issue86 Lock',
      role: 'System Engineer',
      systemRole: 'USER',
      clearanceLevel: 1,
      isActive: true,
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

// --- 1) Login -> access + refresh; Bearer erisim (AC #1) ---------------------
test('POST /api/auth/login — access+refresh token dondurur, korunan uca erisilir', async () => {
  const login = await request(app).post('/api/auth/login').send(PM);
  assert.equal(login.status, 200);
  assert.ok(login.body.accessToken, 'accessToken dondurulmeli');
  assert.ok(login.body.refreshToken, 'refreshToken dondurulmeli');
  assert.equal(login.body.user.passwordHash, undefined, 'passwordHash asla donmemeli');

  const projects = await request(app).get('/api/projects').set('Authorization', `Bearer ${login.body.accessToken}`);
  assert.equal(projects.status, 200, 'Bearer accessToken ile korunan uca erisilmeli');
  assert.ok(Array.isArray(projects.body));
});

// --- 2) Hesap kilidi (AC #2) -------------------------------------------------
test('5 basarisiz giris -> hesap kilitlenir; dogru sifreyle bile 423', async () => {
  for (let i = 1; i <= 5; i++) {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ username: LOCK.username, password: 'kesinlikle-yanlis' });
    assert.equal(r.status, 401, `deneme ${i}: 401 beklenir, ${r.status} alindi`);
  }
  const user = await prisma.user.findUnique({ where: { username: LOCK.username } });
  assert.equal(user.failedAttempts, 5);
  assert.ok(user.lockedUntil && user.lockedUntil > new Date(), 'lockedUntil 15dk ileriye kurulmali');

  // 6. deneme: dogru sifre, ama hesap hala kilitli.
  const locked = await request(app).post('/api/auth/login').send(LOCK);
  assert.equal(locked.status, 423, 'kilit hesap dogru sifreyle bile 423 donmeli');
  assert.equal(locked.body.code, 'account_locked');
});

// --- 3) Refresh rotasyonu (AC #3) --------------------------------------------
test('refresh — eski token revoke olur, yeni cift uretilir', async () => {
  const login = await request(app).post('/api/auth/login').send(PM);
  const oldRT = login.body.refreshToken;

  const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRT });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.accessToken);
  assert.ok(refreshed.body.refreshToken);
  assert.notEqual(refreshed.body.refreshToken, oldRT, 'rotasyon: yeni refreshToken farkli olmali');

  const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRT });
  assert.equal(reuse.status, 401, 'eski (revoke edilen) refreshToken tekrar kullanilamaz');
});

// --- 4) Logout (AC #4) -------------------------------------------------------
test('logout — refresh token revoke edilir', async () => {
  const login = await request(app).post('/api/auth/login').send(PM);
  const rt = login.body.refreshToken;

  const out = await request(app).post('/api/auth/logout').send({ refreshToken: rt });
  assert.equal(out.status, 204, 'logout 204 donmeli');

  const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: rt });
  assert.equal(reuse.status, 401, 'logout edilen refreshToken yenilenemez');
});

// --- 5) Audit (AC #5) --------------------------------------------------------
test('auth olaylari SystemAuditLog a yazilir', async () => {
  const success = await prisma.systemAuditLog.findMany({ where: { action: 'login.success' } });
  assert.ok(success.length >= 1, 'en az bir login.success kayitli olmali');
  const locked = await prisma.systemAuditLog.findMany({ where: { action: 'login.locked' } });
  assert.ok(locked.length >= 1, 'en az bir login.locked kayitli olmali');
  // Basarisiz login icin de kayit olmali (test 2'de 4 adet login.failed).
  const failed = await prisma.systemAuditLog.findMany({ where: { action: 'login.failed' } });
  assert.ok(failed.length >= 1, 'en az bir login.failed kayitli olmali');
});

// --- 6) Refresh/logout ayri daha yuksek limit (AC #6 bileseni) --------------
test('refresh/logout login den farkli (daha yuksek) limit kullanir', async () => {
  // loginLimiter 20/15dk; refreshLimiter 100/15dk. Ayni IP'den 21 logout
  // istegi login limitini asardi ama refresh/logout limitinin altindadir -> 429 yok.
  for (let i = 1; i <= 21; i++) {
    const r = await request(app).post('/api/auth/logout').send({ refreshToken: 'yok-boyle-token' });
    assert.ok([204, 401].includes(r.status), `logout ${i}: 204/401 beklenir, ${r.status} alindi (429 olmamali)`);
  }
});
