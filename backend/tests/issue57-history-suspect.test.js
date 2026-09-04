// ============================================================================
//  issue57-history-suspect.test.js — Issue #57: Gereksinim Degisim Yonetimi.
//
//  SCD Type 4 versiyon gecmisi + suspect linkler icin kabul kriterleri:
//    1) Icerik alani (title/desc/field/priority/dal_level) degisince:
//       history satiri yazilir VE downstream (Satisfies/Verifies) linkler suspect.
//    2) Status cascade ile degisince IKISI DE tetiklenmez.
//    3) Custom attribute degisince tetiklenmez (yalnizca built-in icerik alanlari).
//    4) locked kayda PUT -> 403 -> history satiri yazilmaz.
//    5) ID sabit kalir, baglantilar kopmaz, eski versiyon GET /history'den gorulur.
//    6) Clear-suspect yalnizca approve izni olanlarca yapilir + AuditLog yazilir.
//
//  Calistirma: docker compose up -d db  +  pnpm test tests/issue57-history-suspect.test.js
// ============================================================================
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import request from 'supertest';
// Ortak env + DB reset (tek dogruluk kaynagi: tests/_setup.js).
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-issue57', password: 'pm-pass-issue57' };
let pmToken = null;
let pmUserId;
let proj;
// Ana gereksinim: 'System Requirement' -> bilesen 'req-system'
let reqMain;
let childReq;
let testCaseRow;
let satisfiesLink;
let verifiesLink;
// Personel: approve izni olan + olmayan
let approvePersonnelToken;
let approvePersonnelId;
let noApproveToken;

async function createRequirement(overrides = {}) {
  return prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: overrides.text_id || `REQ-SYS-${Math.random().toString(36).slice(2, 8)}`,
      title: overrides.title || 'Test gereksinim',
      description: overrides.description || '',
      type: overrides.type || 'System Requirement',
      ...overrides,
    },
  });
}

before(async () => {
  resetDb();

  const { hashPassword } = await import('../src/auth.js');
  const u = await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Issue57 PM',
      role: 'Proje Yoneticisi',
    },
  });
  pmUserId = u.id;

  proj = await prisma.project.create({ data: { name: 'Issue57 Proje' } });
  // API ile olusturulan projelerdeki gibi priority (ve dal_level) defs seed'lensin.
  const { seedDefaultAttributeDefinitions } = await import('../src/attributes.js');
  await seedDefaultAttributeDefinitions(prisma, proj.id);
  await prisma.attributeDefinition.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      key: 'dal_level',
      label: 'DAL Level',
      dataType: 'select',
      options: [
        { value: 'DAL A', label: 'DAL A' },
        { value: 'DAL B', label: 'DAL B' },
      ],
      order: 1,
      system: false,
    },
  });
  // Custom (tetiklemeyen) bir oznitelik tanimi.
  await prisma.attributeDefinition.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      key: 'risk_score',
      label: 'Risk Skoru',
      dataType: 'number',
      order: 2,
      system: false,
    },
  });

  // Ana zincir: User <- System (System, User'i karsilar) degil; test icin
  // System -> Software Satisfies + System -> Test Verifies kullanilir.
  reqMain = await createRequirement({ text_id: 'REQ-SYS-001', title: 'Ana gereksinim' });
  childReq = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SW-001',
      title: 'Alt gereksinim',
      type: 'Software Requirement',
    },
  });
  testCaseRow = await prisma.testCase.create({
    data: {
      projectId: proj.id,
      text_id: 'TC-SYS-001',
      title: 'Test senaryosu',
      type: 'System Test',
    },
  });
  satisfiesLink = await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqMain.id, toId: childReq.id, type: 'Satisfies' },
  });
  verifiesLink = await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqMain.id, toId: testCaseRow.id, type: 'Verifies' },
  });

  // Roller + personel
  const roleApprove = await prisma.role.create({
    data: {
      projectId: proj.id,
      name: 'Onayci Muhendis',
      permissions: { approve: { enabled: true, components: ['req-system'] } },
    },
  });
  const pApprove = await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: roleApprove.id,
      firstName: 'Onay',
      lastName: 'Personel',
      passcode: 'K2X4M',
    },
  });
  approvePersonnelId = pApprove.id;
  const roleNoApprove = await prisma.role.create({
    data: { projectId: proj.id, name: 'Gozlemci', permissions: {} },
  });
  await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: roleNoApprove.id,
      firstName: 'Izin',
      lastName: 'Siz',
      passcode: 'Z7Y3N',
    },
  });

  const t0 = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  assert.equal(t0.status, 200, 'PM login basarili olmali');
  pmToken = t0.body.token;

  const t1 = await request(app).post('/api/auth/passcode').send({ passcode: 'K2X4M' });
  assert.equal(t1.status, 200, 'approve personel login basarili olmali');
  approvePersonnelToken = t1.body.token;

  const t2 = await request(app).post('/api/auth/passcode').send({ passcode: 'Z7Y3N' });
  assert.equal(t2.status, 200);
  noApproveToken = t2.body.token;
});

// ============================================================================
//  1) Icerik degisimi -> history + suspect
// ============================================================================
test('title degisince: history satiri (eski durum) + Satisfies/Verifies linkler suspect olur', async () => {
  const r = await request(app)
    .put(`/api/projects/${proj.id}/requirements/${reqMain.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ title: 'Ana gereksinim (guncel)' });
  assert.equal(r.status, 200, `200 olmali, gelen: ${r.status} ${JSON.stringify(r.body)}`);

  // History: v1 = degisiklik ONCESI durum (eski baslik)
  const history = await prisma.requirementHistory.findMany({
    where: { requirementId: reqMain.id },
    orderBy: { version: 'asc' },
  });
  assert.equal(history.length, 1, 'bir history satiri olmali');
  assert.equal(history[0].version, 1);
  assert.equal(history[0].title, 'Ana gereksinim', 'history eski basligi saklamali');
  assert.equal(history[0].changedBy, pmUserId, 'changedBy = PM userId olmali');

  // Suspect: her iki downstream link de isaretlenmis olmali
  const sLink = await prisma.traceabilityLink.findUnique({ where: { id: satisfiesLink.id } });
  const vLink = await prisma.traceabilityLink.findUnique({ where: { id: verifiesLink.id } });
  assert.equal(sLink.isSuspect, true, 'Satisfies link suspect olmali');
  assert.equal(vLink.isSuspect, true, 'Verifies link suspect olmali');

  // History satiri, ayni transaction'daki UPDATE audit kaydina baglanmis olmali
  const auditRow = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, action: 'UPDATE', entityType: 'requirement', entityId: reqMain.id },
  });
  assert.ok(auditRow, 'UPDATE audit kaydi olmali');
  assert.equal(history[0].auditLogId, auditRow.id, 'history.auditLogId = UPDATE audit kaydi');
  assert.equal(auditRow.actor, pmUserId, 'audit actor PM userId olmali');
});

test('ID sabit kalir, baglantilar kopmaz, eski versiyon GET /history ile gorunur', async () => {
  // Guncel kayit yeni basligi tasir; id aynidir.
  const current = await prisma.requirement.findUnique({ where: { id: reqMain.id } });
  assert.equal(current.title, 'Ana gereksinim (guncel)');
  assert.equal(current.id, reqMain.id, 'ID degismemeli');

  const links = await prisma.traceabilityLink.findMany({
    where: { projectId: proj.id, OR: [{ fromId: reqMain.id }, { toId: reqMain.id }] },
  });
  assert.equal(links.length, 2, 'baglantilar kopmamali');

  const r = await request(app)
    .get(`/api/projects/${proj.id}/requirements/${reqMain.id}/history`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].title, 'Ana gereksinim', 'eski versiyon API uzerinden goruntulenebilmeli');
});

test('priority degisince: yeni versiyon satiri yazilir (v2) ve listeleme desc doner', async () => {
  const r = await request(app)
    .put(`/api/projects/${proj.id}/requirements/${reqMain.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ priority: 'High' });
  assert.equal(r.status, 200, `200 olmali, gelen: ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(r.body.priority, 'High');

  const history = await prisma.requirementHistory.findMany({
    where: { requirementId: reqMain.id },
    orderBy: { version: 'desc' },
  });
  assert.equal(history.length, 2);
  assert.equal(history[0].version, 2);
  assert.equal(history[0].title, 'Ana gereksinim (guncel)', 'v2 = ikinci degisiklik oncesi durum');

  const viaApi = await request(app)
    .get(`/api/projects/${proj.id}/requirements/${reqMain.id}/history`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.deepEqual(
    viaApi.body.map((h) => h.version),
    [2, 1],
    'GET /history versiyonlari desc siralamali',
  );
});

// ============================================================================
//  2) Tetiklemeyen degisiklikler
// ============================================================================
test('custom attribute (risk_score) degisince: history + suspect TETIKLENMEZ', async () => {
  const req = await createRequirement({ text_id: 'REQ-SYS-010', title: 'Ozel alan testi' });
  await request(app)
    .put(`/api/projects/${proj.id}/requirements/${req.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ attributes: { risk_score: 7 } });
  assert.equal(await prisma.requirementHistory.count({ where: { requirementId: req.id } }), 0);

  const req2 = await createRequirement({ text_id: 'REQ-SYS-011', title: 'Ozel alan testi 2' });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: req2.id, toId: childReq.id, type: 'Satisfies' },
  });
  await request(app)
    .put(`/api/projects/${proj.id}/requirements/${req2.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ attributes: { risk_score: 9 } });
  const suspect = await prisma.traceabilityLink.findFirst({
    where: { projectId: proj.id, fromId: req2.id, isSuspect: true },
  });
  assert.equal(suspect, null, 'custom attribute degisimi suspect YAPMAMALI');
});

test('status cascade ile degisince: history + suspect IKISI DE tetiklenmez', async () => {
  const req = await createRequirement({ text_id: 'REQ-SYS-020', title: 'Cascade testi' });
  const tc = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SYS-020', title: 'Cascade testi TC', type: 'System Test' },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: req.id, toId: tc.id, type: 'Verifies' },
  });

  // Test sonucu Approved -> cascade, gereksinim durumunu updateMany ile degistirir.
  const r = await request(app)
    .put(`/api/projects/${proj.id}/testcases/${tc.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ status: 'Approved' });
  assert.equal(r.status, 200);

  const updated = await prisma.requirement.findUnique({ where: { id: req.id } });
  assert.equal(updated.status, 'Approved', 'cascade statusu guncellemeli');

  assert.equal(
    await prisma.requirementHistory.count({ where: { requirementId: req.id } }),
    0,
    'otomatik status gecisi history YAZMAMALI',
  );
  const suspect = await prisma.traceabilityLink.findFirst({
    where: { projectId: proj.id, fromId: req.id, isSuspect: true },
  });
  assert.equal(suspect, null, 'otomatik status gecisi suspect YAPMAMALI');
});

// ============================================================================
//  3) locked kayit
// ============================================================================
test('locked kayda PUT -> 403 -> history satiri yazilmaz', async () => {
  const req = await createRequirement({ text_id: 'REQ-SYS-030', title: 'Kilitli testi' });
  await prisma.requirement.update({ where: { id: req.id }, data: { locked: true } });

  const r = await request(app)
    .put(`/api/projects/${proj.id}/requirements/${req.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ title: 'Kilitli degisim' });
  assert.equal(r.status, 403, `403 olmali, gelen: ${r.status}`);

  assert.equal(await prisma.requirementHistory.count({ where: { requirementId: req.id } }), 0);
  const unchanged = await prisma.requirement.findUnique({ where: { id: req.id } });
  assert.equal(unchanged.title, 'Kilitli testi', 'kilitli kayit degismemeli');
});

// ============================================================================
//  4) Clear-suspect: yalnizca approve izni olanlar + AuditLog
// ============================================================================
test('clear-suspect (gereksinim bazli): approve izni olmayan 403, olan 200 + audit', async () => {
  // reqMain'in linkleri onceki testlerden suspect durumda.
  const noPerm = await request(app)
    .post(`/api/projects/${proj.id}/requirements/${reqMain.id}/clear-suspect`)
    .set('Authorization', `Bearer ${noApproveToken}`);
  assert.equal(noPerm.status, 403, `yetkisiz personel 403 olmali, gelen: ${noPerm.status}`);

  const ok = await request(app)
    .post(`/api/projects/${proj.id}/requirements/${reqMain.id}/clear-suspect`)
    .set('Authorization', `Bearer ${approvePersonnelToken}`);
  assert.equal(ok.status, 200, `approve izni olan 200 olmali, gelen: ${ok.status} ${JSON.stringify(ok.body)}`);
  assert.equal(ok.body.cleared, 2, 'iki suspect link temizlenmeli');

  const remaining = await prisma.traceabilityLink.count({
    where: { projectId: proj.id, fromId: reqMain.id, isSuspect: true },
  });
  assert.equal(remaining, 0, 'tum supheli linkler temizlenmeli');

  const auditRow = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, action: 'SUSPECT_CLEAR', entityId: reqMain.id },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(auditRow, 'SUSPECT_CLEAR audit kaydi olmali');
  assert.equal(auditRow.actor, approvePersonnelId, 'audit actor = approve personel id');
});

test('clear-suspect (link bazli): yetkisiz 403, yetkili 200', async () => {
  // Bir linki yeniden suspect yapalim.
  await prisma.traceabilityLink.update({
    where: { id: verifiesLink.id },
    data: { isSuspect: true },
  });

  const noPerm = await request(app)
    .post(`/api/projects/${proj.id}/links/${verifiesLink.id}/clear-suspect`)
    .set('Authorization', `Bearer ${noApproveToken}`);
  assert.equal(noPerm.status, 403, `yetkisiz personel 403 olmali, gelen: ${noPerm.status}`);

  const ok = await request(app)
    .post(`/api/projects/${proj.id}/links/${verifiesLink.id}/clear-suspect`)
    .set('Authorization', `Bearer ${approvePersonnelToken}`);
  assert.equal(ok.status, 200);
  const link = await prisma.traceabilityLink.findUnique({ where: { id: verifiesLink.id } });
  assert.equal(link.isSuspect, false, 'link supheli durumdan cikarilmali');
});
