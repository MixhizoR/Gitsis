// ============================================================================
//  api.test.js — Backend API regresyon testleri (node:test + supertest).
//  Kapsam: kimlik dogrulama (/auth/login) ve proje sinirini asma (IDOR)
//  korumasi (projectAccessGuard).
//  Issue #97: passcode/Personnel dunyasi KALDIRILDI — IDOR testleri artik
//  projeye atanmis normal User (User.projectId) uzerinden yapilir.
//
//  Calistirma on kosullari:
//    Yerel: docker compose up -d db   (test DB'si otomatik olusturulur)
//    CI:    TEST_DATABASE_URL env degiskeni hazir Postgres'e isaret eder.
//
//  Calistirma: npm test   (backend klasoru icinde)
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

// --- Seed sabitleri -----------------------------------------------------------
const PM_CREDENTIALS = { username: 'pm-test', password: 'pm-pass-1234' };
const MEMBER_CREDENTIALS = { username: 'member-test', password: 'member-pass-1234' };
let projA;
let projB;
let memberToken = null;
before(async () => {
  // Test veritabanini sifirdan kur (ortak yardimci).
  resetDb();

  const { hashPassword } = await import('../src/auth.js');
  const { ensureSystemRoles } = await import('../src/systemRoles.js');
  await ensureSystemRoles(prisma);

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      passwordHash: await hashPassword(PM_CREDENTIALS.password),
      name: 'Test Proje Yöneticisi',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
    },
  });

  projA = await prisma.project.create({ data: { name: 'IDOR Proje A' } });
  projB = await prisma.project.create({ data: { name: 'IDOR Proje B' } });

  // Issue #97: proje üyesi — User.projectId ile projaya atanir (passcode yok).
  await prisma.user.create({
    data: {
      username: MEMBER_CREDENTIALS.username,
      passwordHash: await hashPassword(MEMBER_CREDENTIALS.password),
      name: 'Ali Veli',
      role: 'System Engineer',
      roleKey: 'system_engineer',
      projectId: projA.id,
    },
  });

  await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-901',
      title: 'A projesi gereksinimi',
      type: 'System Requirement',
    },
  });
  await prisma.requirement.create({
    data: {
      projectId: projB.id,
      text_id: 'REQ-SYS-902',
      title: 'B projesi gereksinimi',
      type: 'System Requirement',
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

// --- Kimlik dogrulama ---------------------------------------------------------

test('POST /api/auth/login — hatali sifre 401 dondurur', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: PM_CREDENTIALS.username, password: 'kesinlikle-yanlis' });
  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('POST /api/auth/login — gecerli PM girisi token dondurur', async () => {
  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.ok(res.body.refreshToken);
  assert.equal(res.body.user.username, PM_CREDENTIALS.username);
});

test('GET /api/users — tokensiz istek 401 dondurur', async () => {
  const res = await request(app).get('/api/users');
  assert.equal(res.status, 401);
});

test('GET /api/users — sahte token 401 dondurur', async () => {
  const res = await request(app).get('/api/users').set('Authorization', 'Bearer sahte.token.degeri');
  assert.equal(res.status, 401);
});

// --- Uye girisi (Issue #97: passcode KALDIRILDI, tek giris /auth/login) --------

test('POST /api/auth/passcode — endpoint KALDIRILDI (401: auth kapisi yolun onunde)', async () => {
  // requireAuth PUBLIC_PATHS listesinde olmadigi icin 401 doner (route'a ulasamaz).
  const res = await request(app).post('/api/auth/passcode').send({ passcode: 'TEST-1234' });
  assert.equal(res.status, 401);
});

test('POST /api/auth/login — atanmis uye kendi projesine girer', async () => {
  const res = await request(app).post('/api/auth/login').send(MEMBER_CREDENTIALS);
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.projectId, projA.id);
  assert.notEqual(res.body.user.roleKey, 'pm');
  memberToken = res.body.accessToken;
});

// --- IDOR korumasi (projectAccessGuard) -----------------------------------------

test('IDOR — uye KENDI projesindeki gereksinimleri gorebilir', async () => {
  assert.ok(memberToken, 'uye giris testi token uretmis olmali');
  const res = await request(app)
    .get(`/api/projects/${projA.id}/requirements`)
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].text_id, 'REQ-SYS-901');
});

test('IDOR — uye BASKA projeye erisemez (403)', async () => {
  const res = await request(app)
    .get(`/api/projects/${projB.id}/requirements`)
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(res.status, 403);
});

// --- Security: audit POST kaldirildi ----------------------------------------

test('POST /api/projects/:pid/audit — endpoint kaldirildi (404)', async () => {
  const res = await request(app)
    .post(`/api/projects/${projA.id}/audit`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ action: 'TEST', entityType: 'requirement', entityId: 'test', message: 'deneme' });
  assert.equal(res.status, 404);
});

// --- Security: register requirePM -------------------------------------------

test('POST /api/auth/register — PM olmayan kullanici 403 alir', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ username: 'yeni-kullanici', password: 'sifre123', name: 'Yeni Kullanici' });
  assert.equal(res.status, 403);
});

// --- Security: traceability IDOR korumasi -----------------------------------

test('IDOR — uye BASKA projenin traceability matrixine erisemez (403)', async () => {
  const res = await request(app)
    .get(`/api/projects/${projB.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(res.status, 403);
});

test('IDOR — uye KENDI projesinin traceability matrixine erisebilir (200)', async () => {
  const res = await request(app)
    .get(`/api/projects/${projA.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(res.status, 200);
});
