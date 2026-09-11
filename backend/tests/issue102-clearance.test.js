// ============================================================================
//  issue102-clearance.test.js — Issue #102: Clearance 1-5 araligi + sinir.
//  Kapsam:
//    1) Admin kullanici olustururken 1..5 disi clearanceLevel reddedilir.
//    2) Admin kullanici guncellerken 1..5 disi clearanceLevel reddedilir.
//    3) Gereksinim olustururken 1..5 disi clearanceLevel reddedilir.
//    4) Gecerli sinir degerleri kabul edilir (1 ve 5).
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const ADMIN = { username: 'admin-issue102', password: 'admin-pass-1234' };
const PM = { username: 'pm-issue102', password: 'pm-pass-1234' };

let adminToken;
let pmToken;
let pid;

async function login(creds) {
  const res = await request(app).post('/api/auth/login').send(creds);
  assert.equal(res.status, 200, `login ${creds.username}`);
  return res.body.accessToken;
}

function createUser(token, body) {
  return request(app).post('/api/admin/users').set('Authorization', `Bearer ${token}`).send(body);
}

function patchUser(token, id, body) {
  return request(app).patch(`/api/admin/users/${id}`).set('Authorization', `Bearer ${token}`).send(body);
}

function createReq(token, body) {
  return request(app).post(`/api/projects/${pid}/requirements`).set('Authorization', `Bearer ${token}`).send(body);
}

before(async () => {
  resetDb();
  const { hashPassword } = await import('../src/auth.js');
  const proj = await prisma.project.create({ data: { name: 'Clearance 102 Proje' } });
  pid = proj.id;
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      passwordHash: await hashPassword(ADMIN.password),
      name: 'Admin 102',
      role: 'Admin',
      roleKey: 'admin',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  await prisma.user.create({
    data: {
      username: PM.username,
      passwordHash: await hashPassword(PM.password),
      name: 'PM 102',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  adminToken = await login(ADMIN);
  pmToken = await login(PM);
});

after(async () => {
  await prisma.$disconnect();
});

// --- Admin kullanici olusturma: 1..5 disi red ---------------------------------
test('admin kullanici olustururken clearanceLevel 0/6/NaN reddedilir', async () => {
  for (const bad of [0, 6, 'abc', 2.5]) {
    const r = await createUser(adminToken, {
      username: `bad-cl-${String(bad).replace('.', '_')}-${Date.now()}`,
      password: 'pass-1234',
      name: 'Bad CL',
      clearanceLevel: bad,
    });
    assert.equal(r.status, 400, `clearanceLevel=${bad} -> 400 beklenir (${r.body.error})`);
  }
});

test('admin kullanici olustururken sinir degerleri 1 ve 5 kabul edilir', async () => {
  for (const ok of [1, 5]) {
    const r = await createUser(adminToken, {
      username: `ok-cl-${ok}-${Date.now()}`,
      password: 'pass-1234',
      name: 'Ok CL',
      clearanceLevel: ok,
    });
    assert.equal(r.status, 201, `clearanceLevel=${ok} -> 201 beklenir`);
    assert.equal(r.body.clearanceLevel, ok);
  }
});

// --- Admin kullanici guncelleme: 1..5 disi red --------------------------------
test('admin kullanici guncellerken clearanceLevel 1..5 disi reddedilir', async () => {
  const created = await createUser(adminToken, {
    username: `patch-cl-${Date.now()}`,
    password: 'pass-1234',
    name: 'Patch CL',
    clearanceLevel: 3,
  });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const bad = await patchUser(adminToken, id, { clearanceLevel: 6 });
  assert.equal(bad.status, 400, 'clearanceLevel=6 -> 400 beklenir');

  const bad2 = await patchUser(adminToken, id, { clearanceLevel: 0 });
  assert.equal(bad2.status, 400, 'clearanceLevel=0 -> 400 beklenir');

  const ok = await patchUser(adminToken, id, { clearanceLevel: 5 });
  assert.equal(ok.status, 200, 'clearanceLevel=5 -> 200 beklenir');
  assert.equal(ok.body.clearanceLevel, 5);
});

// --- Gereksinim olusturma: 1..5 disi red --------------------------------------
test('gereksinim olustururken clearanceLevel 1..5 disi reddedilir', async () => {
  for (const bad of [0, 6]) {
    const r = await createReq(pmToken, {
      type: 'System Requirement',
      title: `Bad CL ${bad}`,
      clearanceLevel: bad,
    });
    assert.equal(r.status, 400, `clearanceLevel=${bad} -> 400 beklenir`);
  }
});

test('gereksinim olustururken gecerli clearanceLevel kabul edilir', async () => {
  const r = await createReq(pmToken, {
    type: 'System Requirement',
    title: 'Ok CL 4',
    clearanceLevel: 4,
  });
  assert.equal(r.status, 201, 'clearanceLevel=4 -> 201 beklenir');
  assert.equal(r.body.clearanceLevel, 4);
});
