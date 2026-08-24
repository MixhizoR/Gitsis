// ============================================================================
//  api.test.js — Backend API regresyon testleri (node:test + supertest).
//  Kapsam: kimlik dogrulama (/auth/login, /auth/passcode) ve proje sinirini
//  asma (IDOR) korumasi (projectAccessGuard).
//
//  Calistirma on kosullari:
//    Yerel: docker compose up -d db   (test DB'si otomatik olusturulur)
//    CI:    TEST_DATABASE_URL env degiskeni hazir Postgres'e isaret eder.
//
//  Calistirma: npm test   (backend klasoru icinde)
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

// --- Import'lardan ONCE ortam ayarlari (PrismaClient kurulumda env okur) ----
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  // Yerel gelistirmede compose db'si host'a yalnizca 5433'ten acilir.
  'postgresql://ehsim:ehsim_pass@localhost:5433/ehsim_rmt_test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

// --- Seed sabitleri -----------------------------------------------------------
const PM_CREDENTIALS = { username: 'pm-test', password: 'pm-pass-1234' };
let projA;
let projB;
let personnelToken = null;

before(async () => {
  // Test veritabanini sifirdan kur.
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // Zaten var — sorun degil.
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Test Proje Yoneticisi',
      role: 'Proje Yoneticisi',
    },
  });

  projA = await prisma.project.create({ data: { name: 'IDOR Proje A' } });
  projB = await prisma.project.create({ data: { name: 'IDOR Proje B' } });

  const roleA = await prisma.role.create({
    data: { projectId: projA.id, name: 'Muhendis', permissions: {} },
  });
  await prisma.personnel.create({
    data: {
      projectId: projA.id,
      roleId: roleA.id,
      firstName: 'Ali',
      lastName: 'Veli',
      passcode: 'TEST-1234',
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
  assert.ok(res.body.token);
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

// --- Personel passcode girisi ---------------------------------------------------

test('POST /api/auth/passcode — personel kendi projesine dusur', async () => {
  const res = await request(app).post('/api/auth/passcode').send({ passcode: 'TEST-1234' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.project.name, 'IDOR Proje A');
  personnelToken = res.body.token;
});

// --- IDOR korumasi (projectAccessGuard) -----------------------------------------

test('IDOR — personel KENDI projesindeki gereksinimleri gorebilir', async () => {
  assert.ok(personnelToken, 'passcode testi token uretmiş olmali');
  const res = await request(app)
    .get(`/api/projects/${projA.id}/requirements`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].text_id, 'REQ-SYS-901');
});

test('IDOR — personel BASKA projeye erisemez (403)', async () => {
  const res = await request(app)
    .get(`/api/projects/${projB.id}/requirements`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 403);
});
