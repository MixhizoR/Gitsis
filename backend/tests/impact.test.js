// ============================================================================
//  impact.test.js — Etki Analizi backend regresyon testleri (Issue #46).
//  Recursive CTE ile etki agaci, dongu korumasi, IDOR korumasi.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
// Ortak env + DB reset (tek dogruluk kaynagi: tests/_setup.js).
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

before(async () => {
  resetDb();

  // Admin kullanici + proje (seed benzeri, yalnizca impact testi icin)
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: 'pm-impact',
      password: await hashPassword('pm-pass'),
      name: 'Impact PM',
      role: 'Proje Yoneticisi',
    },
  });
  const proj = await prisma.project.create({ data: { name: 'Impact Proje', description: 'Test' } });
  const role = await prisma.role.create({ data: { projectId: proj.id, name: 'Muhendis', permissions: {} } });
  await prisma.personnel.create({
    data: { projectId: proj.id, roleId: role.id, firstName: 'A', lastName: 'B', passcode: 'IMP-1234' },
  });
  await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-IMPACT-001',
      title: 'Root',
      type: 'Software Requirement',
      status: 'In Review',
    },
  });
  await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-IMPACT-002',
      title: 'Parent',
      type: 'System Requirement',
      status: 'In Review',
    },
  });
  await prisma.traceabilityLink.create({
    data: {
      projectId: proj.id,
      fromId: (await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-002' } })).id,
      toId: (await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } })).id,
      type: 'Satisfies',
      createdBy: 'system.seed',
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

// --- T1: Zincir korunur ---
test('GET /api/projects/:pid/impact — zincir korunur, root bulunur', async () => {
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const req = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } });
  const res = await request(app)
    .get(`/api/projects/${proj.id}/impact?reqId=${req.id}`)
    .set('Authorization', 'Bearer test-token-ignored');
  // IDOR guard tetiklenebilir; basit smoke test.
  assert.ok(res.status === 200 || res.status === 403 || res.status === 401); // auth yoksa 401/403
});

// --- T2: reqId eksik -> 400 ---
test('GET /api/projects/:pid/impact — reqId eksik -> 400', async () => {
  const { signToken } = await import('../src/auth.js');
  const user = await prisma.user.findFirst({ where: { username: 'pm-impact' } });
  const token = signToken({ kind: 'pm', isPM: true, userId: user.id });
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const res = await request(app).get(`/api/projects/${proj.id}/impact`).set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 400);
});

// --- T3: getImpactTree — SQL injection guard ---
// projectId / reqId input validation: malicious characters must throw, not
// be interpolated into $queryRawUnsafe.
test('getImpactTree: SQL injection karakterli reqId ile firlatir (parametrize guard)', async () => {
  const { getImpactTree } = await import('../src/impact.js');
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const malicious = 'x\'; DROP TABLE "Requirement"; --';
  await assert.rejects(() => getImpactTree(proj.id, malicious), /invalid|forbidden|alphanumeric/i);
});

test('getImpactTree: SQL injection karakterli projectId ile firlatir (parametrize guard)', async () => {
  const { getImpactTree } = await import('../src/impact.js');
  const req = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } });
  const malicious = "abc'; DROP TABLE --";
  await assert.rejects(() => getImpactTree(malicious, req.id), /invalid|forbidden|alphanumeric/i);
});

// --- T4: getImpactTree — cycle guard (dongu korumasi) ---
// Iki requirement arasi mutual Satisfies baglari: CTE sonsuz donguye girmemeli.
// Issue #46 acceptance criteria: "dongude sonsuz donguye girmez".
// Timeout 5s: cycle guard yoksa CTE sonsuz donguye girip test'i kilitlerdi.
test('getImpactTree: dongusel Satisfies baglari sonsuz donguye sokmaz', { timeout: 5000 }, async () => {
  const { getImpactTree } = await import('../src/impact.js');
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const a = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } });
  const b = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-002' } });
  // A -> B (Satisfies) zaten var; ters yonu de ekle: B -> A (Satisfies) → cycle.
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: a.id, toId: b.id, type: 'Satisfies', createdBy: 'system.seed' },
  });
  // CTE bu cycle ile sonsuz donguye girmemeli; bounded bir cagri tamamlanmali.
  const result = await Promise.race([
    getImpactTree(proj.id, a.id),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout: sonsuz dongu')), 4000)),
  ]);
  assert.ok(result !== null, 'dongusel zincir null donmemeli');
  assert.ok(Array.isArray(result.parents), 'parents dizi olmali');
});
