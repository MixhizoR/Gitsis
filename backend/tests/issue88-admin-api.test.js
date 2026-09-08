// ============================================================================
//  issue88-admin-api.test.js — Issue #88: Admin kullanici yonetimi API'leri.
//  Kapsam:
//    1) USER rolu admin uclarinda 403 alir (AC #1).
//    2) Admin kullanici olusturur; o kullanici login olabilir (AC #2).
//    3) Admin kilitli hesabi acar; kullanici yeniden login olur (AC #3).
//    4) Audit log sifre/token icermez (AC #4).
//    5) Admin rol/clearance/aktiflik gunceller + sifre sifirlar.
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

const ADMIN = { username: 'admin-issue88', password: 'admin-pass-1234' };
const USER = { username: 'user-issue88', password: 'user-pass-1234' };

let adminToken;
let userToken;

async function login(creds) {
  return request(app).post('/api/auth/login').send(creds);
}

before(async () => {
  resetDb();
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      passwordHash: await hashPassword(ADMIN.password),
      name: 'Admin',
      role: 'System Engineer',
      systemRole: 'ADMIN',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  await prisma.user.create({
    data: {
      username: USER.username,
      passwordHash: await hashPassword(USER.password),
      name: 'User',
      role: 'System Engineer',
      systemRole: 'USER',
      clearanceLevel: 1,
      isActive: true,
    },
  });
  adminToken = (await login(ADMIN)).body.accessToken;
  userToken = (await login(USER)).body.accessToken;
});

after(async () => {
  await prisma.$disconnect();
});

// --- AC #1: USER rolü admin uçlarında 403 -----------------------------------
test('USER rolu admin uclarinda 403 alir', async () => {
  for (const path of ['/api/users', '/api/audit-logs']) {
    const r = await request(app).get(path).set('Authorization', `Bearer ${userToken}`);
    assert.equal(r.status, 403, `GET ${path} -> 403 beklenir`);
  }
  const create = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ username: 'olmaz', password: 'olmaz1234', name: 'Olmaz' });
  assert.equal(create.status, 403, 'POST /api/users -> 403 beklenir');
});

// --- Admin listeleme: passwordHash sizmaz ------------------------------------
test('admin kullanicilari listeler (passwordHash donmez)', async () => {
  const r = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.ok(r.body.every((u) => u.passwordHash === undefined));
  assert.ok(r.body.some((u) => u.username === USER.username));
});

// --- AC #2: admin olusturur -> kullanici login olur --------------------------
test('admin yeni kullanici olusturur ve o kullanici login olabilir', async () => {
  const NEWPASS = 'SuperSecret-PW-123';
  const r = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      username: 'yeni-issue88',
      password: NEWPASS,
      name: 'Yeni Kullanici',
      role: 'System Engineer',
      clearanceLevel: 2,
    });
  assert.equal(r.status, 201);
  assert.equal(r.body.username, 'yeni-issue88');
  assert.equal(r.body.clearanceLevel, 2);
  assert.equal(r.body.passwordHash, undefined);

  const lg = await login({ username: 'yeni-issue88', password: NEWPASS });
  assert.equal(lg.status, 200);
  assert.ok(lg.body.accessToken);
});

// --- AC #4: log sifre/token icermez -----------------------------------------
test('audit log sifre veya token icermez', async () => {
  const logs = await request(app).get('/api/audit-logs').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(logs.status, 200);
  assert.ok(Array.isArray(logs.body));
  const blob = JSON.stringify(logs.body);
  assert.ok(!blob.includes('SuperSecret-PW-123'), 'log sifreyi icermemeli');
  assert.ok(!blob.toLowerCase().includes('passwordhash'), 'log passwordHash icermemeli');
  // En az bir admin.user.create kaydi olmali.
  assert.ok(logs.body.some((l) => l.action === 'admin.user.create'));
});

// --- AC #3: admin kilitli hesabi acar ---------------------------------------
test('admin kilitli hesabi acar, kullanici yeniden login olur', async () => {
  await prisma.user.update({
    where: { username: USER.username },
    data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) },
  });
  const locked = await login(USER);
  assert.equal(locked.status, 423, 'kilitli hesap 423 donmeli');

  const target = await prisma.user.findUnique({ where: { username: USER.username } });
  const un = await request(app).post(`/api/users/${target.id}/unlock`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(un.status, 200);
  assert.equal(un.body.failedAttempts, 0);
  assert.equal(un.body.lockedUntil, null);

  const ok = await login(USER);
  assert.equal(ok.status, 200, 'kilit acildiktan sonra login olmali');
});

// --- Admin rol/clearance/aktiflik gunceller + sifre sifirlar ----------------
test('admin rol/clearance gunceller ve sifre sifirlar', async () => {
  const target = await prisma.user.findUnique({ where: { username: USER.username } });
  const r = await request(app)
    .patch(`/api/users/${target.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ role: 'Developer', clearanceLevel: 3, isActive: true, password: 'yeni-sifre-9999' });
  assert.equal(r.status, 200);
  assert.equal(r.body.role, 'Developer');
  assert.equal(r.body.clearanceLevel, 3);

  const lg = await login({ username: USER.username, password: 'yeni-sifre-9999' });
  assert.equal(lg.status, 200, 'yeni sifre ile login olmali');
});
