// ============================================================================
//  snapshot.test.js — Backend API testleri: ProjectSnapshot (Issue #8).
//  TDD: bu test önce, endpoint'ler eklendikten sonra yeşile döner.
//  Kapsam: snapshot oluşturma (PM), yetkisiz erişim reddi, listeleme,
//  salt-okunur detay, silme ve AuditLog kaydı.
//
//  Calistirma: npm test backend/tests/snapshot.test.js
//  DB: npm test altında otomatik seed edilir (api.test.js shared before).
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';

// Import'lardan ONCE ortam ayarları (PrismaClient kurulumda env okur).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ehsim-snapshot-test-secret';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(process.env.POSTGRES_PASSWORD || 'ehsim_local_pass_2026')}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-snap', password: 'pm-snap-pass-1234' };
let pmToken = null;
let proj = null;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      const { execSync } = await import('node:child_process');
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // Zaten var — sorun değil.
    }
  }
  const { execSync } = await import('node:child_process');
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    cwd: '.',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Snapshot Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Snapshot Test Project' } });

  // Projeye birkaç varlık koyalım (snapshot içinde görmek için).
  await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-001', title: 'Snapshot gereksinimi', type: 'User Requirement' },
  });
  await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-ACC-001', title: 'Snapshot testi', type: 'Acceptance Test' },
  });
  await prisma.traceabilityLink.create({
    data: {
      projectId: proj.id,
      fromId: (await prisma.requirement.findFirst({ where: { projectId: proj.id } })).id,
      toId: (await prisma.testCase.findFirst({ where: { projectId: proj.id } })).id,
      type: 'Verifies',
    },
  });

  // PM token al.
  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = res.body.token;
});

after(async () => {
  await prisma.$disconnect();
});

// --- Token / yetki ----------------------------------------------------------

test('POST /api/projects/:pid/snapshots — tokensiz 401 dondurur', async () => {
  const res = await request(app).post(`/api/projects/${proj.id}/snapshots`).send({ name: 'Bo güvenlik' });
  assert.equal(res.status, 401);
});

test('POST /api/projects/:pid/snapshots — PM token ile snapshot olusturur', async () => {
  const res = await request(app)
    .post(`/api/projects/${proj.id}/snapshots`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ name: 'Beta snapshot' });
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.equal(res.body.name, 'Beta snapshot');
});

test('GET /api/projects/:pid/snapshots — PM token ile listeyi dondurur', async () => {
  const res = await request(app).get(`/api/projects/${proj.id}/snapshots`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length >= 1);
  assert.ok(res.body.data[0].createdAt);
  assert.ok(typeof res.body.total === 'number');
  assert.ok(res.body.take > 0);
  assert.ok(res.body.skip >= 0);
});

test('GET /api/projects/:pid/snapshots/:snapshotId — detayi (items) ile dondurur', async () => {
  // önce bir snapshot yarat.
  const created = await request(app)
    .post(`/api/projects/${proj.id}/snapshots`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ name: 'Detay snapshot' });
  assert.equal(created.status, 201);
  const sid = created.body.id;

  const res = await request(app)
    .get(`/api/projects/${proj.id}/snapshots/${sid}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Detay snapshot');
  assert.ok(res.body.projectId === proj.id);
  // items frozen copy içermeli.
  assert.ok(Array.isArray(res.body.items));
  const reqItem = res.body.items.find((i) => i.entityType === 'requirement');
  assert.ok(reqItem, 'snapshot items içinde requirement olmalı');
  assert.equal(reqItem.data.title, 'Snapshot gereksinimi');
});

test('GET /api/projects/:pid/snapshots/:snapshotId — baska projenin id si 404', async () => {
  const other = await prisma.project.create({ data: { name: 'Dış proje' } });
  const res = await request(app)
    .get(`/api/projects/${other.id}/snapshots/${proj.id}`) // geçersiz snapshotId, farklı proje
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 404);
});

test("DELETE /api/projects/:pid/snapshots/:snapshotId — PM silebilir; AuditLog'da DELETE aksiyonu", async () => {
  const created = await request(app)
    .post(`/api/projects/${proj.id}/snapshots`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ name: 'Silinecek' });
  const sid = created.body.id;

  const res = await request(app)
    .delete(`/api/projects/${proj.id}/snapshots/${sid}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  // AuditLog kontrolü.
  const log = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, action: 'SNAPSHOT_DELETE', entityId: sid },
  });
  assert.ok(log, 'AuditLog SNAPSHOT_DELETE kaydı yok');

  // snapshot geri dönmeli.
  const getRes = await request(app)
    .get(`/api/projects/${proj.id}/snapshots/${sid}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(getRes.status, 404);
});
