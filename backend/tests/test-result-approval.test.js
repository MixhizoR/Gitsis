// ============================================================================
//  test-result-approval.test.js — Test SONUCU artik elle degil, onay/red
//  aksiyonlarindan turetilir (kullanici talebi: "testler editlenerek
//  onaylaniyor, gereksinimler de buna bagli; bunun menudeki onay tusuna
//  baglanmasini istiyorum").
//
//  Kapsam:
//    1) POST/PUT /testcases artik 'status' body alanini yoksayar.
//    2) Tam konsensus (PM + gerekli tum personel) -> test 'Approved', bagli
//       gereksinim cascade ile 'Approved' olur.
//    3) Oy geri cekilince / kilit acilinca test 'In Review'e doner.
//    4) /approvals/reject: TEK yetkili (personel VEYA PM) yeterli, tam
//       konsensus GEREKMEZ -> test derhal 'Rejected' + kilitli olur, bagli
//       gereksinim cascade ile 'Rejected' olur.
//    5) Reddetme de ayni 'approve' izniyle korunur (izinsiz personel 403).
//    6) Kilitli (onaylanmis) kayitta personel reddedemez; PM edebilir.
//    7) PM unlock sonrasi test 'In Review'e doner (yeniden degerlendirme).
//
//  Calistirma: docker compose up -d db  +  npm test tests/test-result-approval.test.js
// ============================================================================
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import request from 'supertest';
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-tra', password: 'pm-tra-pass-1234' };
let pmToken = null;
let proj;
let reqRow; // System Requirement, Verifies ile testCaseRow'a bagli
let testCaseRow; // System Test — approve izinli personel VAR (test-system)
let approveToken; // approve izni olan personel (test-system)
let noApproveToken; // approve izni OLMAYAN personel

before(async () => {
  resetDb();

  const { hashPassword } = await import('../src/auth.js');
  // Bilerek role belirtilmiyor: sema varsayilani 'System Engineer' devreye
  // girer — TAM OLARAK gercek bootstrap admin hesabinin (seed-admin.mjs)
  // rolu. 'Proje Yoneticisi' string'ini elle yazmak, bu suit'in tam da
  // yakalamak istedigi hatayi (role=='Proje Yoneticisi' filtresi) gizlerdi.
  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      passwordHash: await hashPassword(PM_CREDENTIALS.password),
      name: 'TestResult PM',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Test Sonucu Onay Projesi' } });

  const roleApprove = await prisma.role.create({
    data: {
      projectId: proj.id,
      name: 'Test Muhendisi',
      permissions: { approve: { enabled: true, components: ['test-system'] } },
    },
  });
  const pApprove = await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: roleApprove.id,
      firstName: 'Onay',
      lastName: 'Muhendisi',
      passcode: 'TRA01',
    },
  });
  const roleNoApprove = await prisma.role.create({
    data: { projectId: proj.id, name: 'Gozlemci', permissions: {} },
  });
  await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: roleNoApprove.id,
      firstName: 'Izin',
      lastName: 'Siz',
      passcode: 'TRA02',
    },
  });

  const t0 = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  assert.equal(t0.status, 200);
  pmToken = t0.body.token;

  const t1 = await request(app).post('/api/auth/passcode').send({ passcode: 'TRA01' });
  assert.equal(t1.status, 200);
  approveToken = t1.body.token;

  const t2 = await request(app).post('/api/auth/passcode').send({ passcode: 'TRA02' });
  assert.equal(t2.status, 200);
  noApproveToken = t2.body.token;

  reqRow = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-SYS-500', title: 'Onay testi gereksinimi', type: 'System Requirement' },
  });
  testCaseRow = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SYS-500', title: 'Onay testi TC', type: 'System Test' },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqRow.id, toId: testCaseRow.id, type: 'Verifies' },
  });
  // pApprove.id bazi testlerde dogrudan kullanilmiyor ama olusturulmus olmasi yeterli.
  void pApprove;
});

// --- 1) status artik elle girilemez ----------------------------------------

test('POST /testcases: gonderilen status yoksayilir, her zaman In Review baslar', async () => {
  const r = await request(app)
    .post(`/api/projects/${proj.id}/testcases`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ type: 'System Test', title: 'Elle onay denemesi', status: 'Approved' });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'In Review', "status body'den alinmamali");
});

test('PUT /testcases/:id: gonderilen status yoksayilir, diger alanlar guncellenir', async () => {
  const created = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SYS-501', title: 'Once', type: 'System Test' },
  });
  const r = await request(app)
    .put(`/api/projects/${proj.id}/testcases/${created.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ title: 'Sonra', status: 'Approved' });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Sonra', 'baska alanlar hala duzenlenebilir olmali');
  assert.equal(r.body.status, 'In Review', 'status PUT ile degistirilememeli');
});

// --- 2) tam konsensus -> Approved + cascade ---------------------------------

test('vote: approve izinli personel + PM oy verince test Approved olur, bagli gereksinim cascade ile Approved olur', async () => {
  const v1 = await request(app)
    .post(`/api/projects/${proj.id}/approvals/vote`)
    .set('Authorization', `Bearer ${approveToken}`)
    .send({ entityType: 'testcase', entityId: testCaseRow.id });
  assert.equal(v1.status, 200);
  assert.equal(v1.body.status, 'In Review', 'tek personel oyu tek basina yeterli degil');

  const v2 = await request(app)
    .post(`/api/projects/${proj.id}/approvals/vote`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ entityType: 'testcase', entityId: testCaseRow.id });
  assert.equal(v2.status, 200);
  assert.equal(v2.body.status, 'Approved', 'tam konsensus sonrasi Approved olmali');
  assert.equal(v2.body.locked, true);

  const req = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(req.status, 'Approved', 'bagli gereksinim cascade ile Approved olmali');
});

// --- 3) oy geri cekilince / kilit acilinca In Review'e doner ---------------

test("unlock: PM kilidi acinca test In Review'e doner, bagli gereksinim de geri doner", async () => {
  const r = await request(app)
    .post(`/api/projects/${proj.id}/approvals/unlock`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ entityType: 'testcase', entityId: testCaseRow.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'In Review');
  assert.equal(r.body.locked, false);

  const req = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(req.status, 'In Review', 'test tekrar incelemeye donunce gereksinim de donmeli');
});

// --- 4) /approvals/reject: tek yetkili yeterli ------------------------------

test('reject: approve izinli TEK personel (PM beklemeden) testi derhal Failed yapar', async () => {
  // Onceki testten kalan oylar temizlensin ki bu test izole olsun.
  await prisma.approval.deleteMany({ where: { projectId: proj.id, entityId: testCaseRow.id } });
  await prisma.testCase.update({
    where: { id: testCaseRow.id },
    data: { status: 'In Review', locked: false, approvalStatus: 'Pending' },
  });

  const r = await request(app)
    .post(`/api/projects/${proj.id}/approvals/reject`)
    .set('Authorization', `Bearer ${approveToken}`)
    .send({ entityId: testCaseRow.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'Rejected', 'tek yetkili ile derhal Rejected olmali');
  assert.equal(r.body.locked, true);

  const req = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(req.status, 'Rejected', 'bagli gereksinim cascade ile Rejected olmali');

  const auditRow = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, action: 'TEST_REJECT', entityId: testCaseRow.id },
  });
  assert.ok(auditRow, 'TEST_REJECT audit kaydi olmali');
});

// --- 5) izinsiz personel reddedemez -----------------------------------------

test('reject: approve izni olmayan personel 403 alir', async () => {
  const tc = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SYS-502', title: 'Izinsiz red denemesi', type: 'System Test' },
  });
  const r = await request(app)
    .post(`/api/projects/${proj.id}/approvals/reject`)
    .set('Authorization', `Bearer ${noApproveToken}`)
    .send({ entityId: tc.id });
  assert.equal(r.status, 403);

  const after = await prisma.testCase.findUnique({ where: { id: tc.id } });
  assert.equal(after.status, 'In Review', 'reddedilemeyen istekten sonra durum degismemeli');
});

// --- 6) kilitli kayitta yalnizca PM reddedebilir ----------------------------

test('reject: onaylanmis (kilitli) kayitta personel 403 alir, PM reddedebilir', async () => {
  const tc = await prisma.testCase.create({
    data: {
      projectId: proj.id,
      text_id: 'TC-SYS-503',
      title: 'Kilitli red denemesi',
      type: 'System Test',
      status: 'Approved',
      approvalStatus: 'Approved',
      locked: true,
    },
  });

  const personnelAttempt = await request(app)
    .post(`/api/projects/${proj.id}/approvals/reject`)
    .set('Authorization', `Bearer ${approveToken}`)
    .send({ entityId: tc.id });
  assert.equal(personnelAttempt.status, 403, 'kilitliyken personel reddedemez');

  const pmAttempt = await request(app)
    .post(`/api/projects/${proj.id}/approvals/reject`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ entityId: tc.id });
  assert.equal(pmAttempt.status, 200, 'PM kilitliyken de reddedebilir');
  assert.equal(pmAttempt.body.status, 'Rejected');
});
