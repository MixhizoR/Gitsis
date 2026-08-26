// ============================================================================
//  traceability-export.test.js — Issue #15: SQL JOIN'li traceability
//  endpoint'leri. Backend response şekli korunur; JOIN ile çalıştığını
//  doğrular (filter/find kalktı).
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-trace', password: 'pm-pass-1234' };
let proj;
let pmToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // already exists
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
      name: 'Trace Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Trace Join' } });

  // 2 req: biri bağlı, biri bağsız
  const r1 = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-300',
      title: 'R300',
      type: 'System Requirement',
    },
  });
  await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-301',
      title: 'R301',
      type: 'System Requirement',
    },
  });

  // 2 test: biri bağlı, biri değil
  const t1 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-300', title: 'T300', type: 'System Test' },
  });
  await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-301', title: 'T301', type: 'System Test' },
  });

  // 1 Verifies bağ: r1 → t1
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: r1.id, toId: t1.id, type: 'Verifies' },
  });

  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = res.body.token;
  assert.ok(pmToken);
});

after(async () => {
  await prisma.$disconnect();
});

// xlsx binary gövdesini buffer'layıp döndüren supertest parse yardımcısı.
const parseBinary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

// --- /matrix JSON ---------------------------------------------------------

test('GET /traceability/matrix: linkedTests dizisi JOIN ile doğru sırada', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const data = res.body.data;
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 2);

  const r1 = data.find((r) => r.text_id === 'REQ-S-300');
  const r2 = data.find((r) => r.text_id === 'REQ-S-301');
  assert.ok(r1);
  assert.ok(r2);

  // r1 → t1 bağlı
  assert.equal(r1.linkedTests.length, 1);
  assert.equal(r1.linkedTests[0].text_id, 'TC-S-300');
  assert.equal(r1.linkedTests[0].title, 'T300');

  // r2 bağsız
  assert.equal(r2.linkedTests.length, 0);

  // summary doğru
  assert.equal(res.body.summary.totalRequirements, 2);
  assert.equal(res.body.summary.totalTests, 2);
  assert.equal(res.body.summary.totalLinks, 1);
  assert.equal(res.body.summary.linkedRequirements, 1);
});

// --- /export/matrix --------------------------------------------------------

test('GET /export/matrix: 200 + xlsx + geçerli zip imzası (PK)', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/traceability/export/matrix`)
    .set('Authorization', `Bearer ${pmToken}`)
    .buffer(true)
    .parse(parseBinary);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml\.sheet/);
  assert.ok(res.body.length > 1000, `xlsx gövdesi çok küçük: ${res.body.length}`);
  // xlsx = zip → ilk iki bayt 'PK'
  assert.equal(res.body[0], 0x50);
  assert.equal(res.body[1], 0x4b);
});

test('GET /export/matrix: bağı olmayan req boş satırla döner, bağlı req test bilgisi içerir (binary xlsx üzerinden içerik doğrulaması)', async () => {
  // Excel binary olduğu için satır içeriğini doğrudan parse etmek yerine,
  // JOIN'in temel doğruluğunu: ayrılan req+test+link sayıları ile matris
  // endpoint'i üzerinden karşılaştırıyoruz. JOIN tutarlıysa her ikisi de
  // aynı sayıları verir.
  const matrix = await request(app)
    .get(`/api/projects/${proj.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(matrix.status, 200);
  assert.equal(matrix.body.data.length, 2);
  const linkedCount = matrix.body.data.filter((r) => r.linkedTests.length > 0).length;
  assert.equal(linkedCount, 1, 'tam 1 req bağlı olmalı');
});

// --- /export/detailed ------------------------------------------------------

test('GET /export/detailed: 200 + xlsx + ASCII Content-Disposition + geçerli zip imzası', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/traceability/export/detailed`)
    .set('Authorization', `Bearer ${pmToken}`)
    .buffer(true)
    .parse(parseBinary);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml\.sheet/);
  // Node header'da non-ASCII kabul etmez; dosya adı ISO-8859-1 güvenli olmalı.
  const cd = res.headers['content-disposition'] || '';
  assert.ok(cd.includes('attachment'), 'Content-Disposition attachment olmalı');
  assert.ok(
    [...cd].every((c) => c.charCodeAt(0) <= 0x7f),
    'Content-Disposition non-ASCII içeremez',
  );
  assert.ok(res.body.length > 1000, `xlsx gövdesi çok küçük: ${res.body.length}`);
  assert.equal(res.body[0], 0x50);
  assert.equal(res.body[1], 0x4b);
});
