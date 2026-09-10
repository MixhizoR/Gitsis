// ============================================================================
//  assignee.test.js — Gereksinim / test senaryosu SORUMLU PERSONEL atamasi.
//
//  DIKKAT: Sozlukteki "Assigned To" izlenebilirlik BAGI (terim <-> gereksinim)
//  bambaska bir kavramdir ve bu testlerin konusu DEGILDIR.
//
//  Kapsam:
//   - POST/PUT ile atama; bos deger atamayi kaldirir; alan gonderilmezse
//     mevcut atama korunur
//   - Proje sinirini asma reddi: baska projenin personeline atanamaz
//   - Atama degisiminde AYRI bir 'ASSIGN' audit kaydi (insan-okunur mesaj)
//   - Personel silinince atama bosa duser (SetNull), kayit SILINMEZ
//   - GET /personnel passcode sizintisi: personel oturumu passcode GORMEZ
//
//  Calistirma: npm test tests/assignee.test.js
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-assignee', password: 'pm-assignee-pass-1234' };
let pmToken = null;
let personnelToken = null;
let projA = null;
let projB = null;
let personA = null; // projA personeli
let personA2 = null; // projA ikinci personeli (yeniden atama)
let personB = null; // projB personeli (IDOR)

const auth = (req, token = pmToken) => req.set('Authorization', `Bearer ${token}`);

const createPersonnel = async (projectId, firstName, lastName, passcode) => {
  const role = await prisma.role.create({
    data: {
      projectId,
      name: `Rol-${passcode}`,
      permissions: { read: { enabled: true, components: ['req-system'] } },
    },
  });
  return prisma.personnel.create({
    data: { projectId, roleId: role.id, firstName, lastName, passcode },
  });
};

const assignAudits = (projectId, entityId) =>
  prisma.auditLog.findMany({
    where: { projectId, action: 'ASSIGN', entityId },
    orderBy: { createdAt: 'asc' },
  });

before(async () => {
  resetDb();
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      passwordHash: await hashPassword(PM_CREDENTIALS.password),
      name: 'Atama Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  projA = await prisma.project.create({ data: { name: 'Atama Projesi A' } });
  projB = await prisma.project.create({ data: { name: 'Atama Projesi B' } });

  personA = await createPersonnel(projA.id, 'Ayse', 'Demir', 'ASG01');
  personA2 = await createPersonnel(projA.id, 'Mehmet', 'Kaya', 'ASG02');
  personB = await createPersonnel(projB.id, 'Zeynep', 'Ak', 'ASG03');

  const login = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = login.body.token;
  const pass = await request(app).post('/api/auth/passcode').send({ passcode: 'ASG01' });
  personnelToken = pass.body.token;
});

after(async () => {
  await prisma.$disconnect();
});

const newRequirement = async (body = {}) =>
  auth(request(app).post(`/api/projects/${projA.id}/requirements`)).send({
    title: 'Atanacak gereksinim',
    type: 'System Requirement',
    ...body,
  });

test('POST /requirements — assigneeId kaydedilir ve ASSIGN audit kaydi yazilir', async () => {
  const res = await newRequirement({ assigneeId: personA.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.assigneeId, personA.id);

  const audits = await assignAudits(projA.id, res.body.id);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'ASSIGN');
  assert.match(audits[0].message, /Ayse Demir/);
  assert.equal(audits[0].textId, res.body.text_id);
});

test('POST /requirements — atama verilmezse null kalir, ASSIGN kaydi olusmaz', async () => {
  const res = await newRequirement();
  assert.equal(res.status, 201);
  assert.equal(res.body.assigneeId, null);
  assert.equal((await assignAudits(projA.id, res.body.id)).length, 0);
});

test('POST /requirements — BASKA projenin personeline atanamaz', async () => {
  const res = await newRequirement({ assigneeId: personB.id });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Gecersiz atama/);
});

test('POST /requirements — var olmayan personel id reddedilir', async () => {
  const res = await newRequirement({ assigneeId: '11111111-1111-1111-1111-111111111111' });
  assert.equal(res.status, 400);
});

test('PUT /requirements/:id — atama degisince ASSIGN kaydi eski ve yeni adi icerir', async () => {
  const created = await newRequirement({ assigneeId: personA.id });
  const res = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeId: personA2.id,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.assigneeId, personA2.id);

  const audits = await assignAudits(projA.id, created.body.id);
  assert.equal(audits.length, 2); // olusturmadaki atama + degisim
  assert.match(audits[1].message, /Ayse Demir/);
  assert.match(audits[1].message, /Mehmet Kaya/);
});

test('PUT /requirements/:id — bos deger atamayi KALDIRIR', async () => {
  const created = await newRequirement({ assigneeId: personA.id });
  const res = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeId: '',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.assigneeId, null);

  const audits = await assignAudits(projA.id, created.body.id);
  assert.match(audits[audits.length - 1].message, /kaldirildi/);
});

test('PUT /requirements/:id — assigneeId gonderilmezse mevcut atama KORUNUR', async () => {
  const created = await newRequirement({ assigneeId: personA.id });
  const res = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    title: 'Yalnizca baslik degisti',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.assigneeId, personA.id);
  // Atama degismedigi icin yeni ASSIGN kaydi YAZILMAZ.
  assert.equal((await assignAudits(projA.id, created.body.id)).length, 1);
});

test('PUT /requirements/:id — ayni kisiye yeniden atama ASSIGN kaydi URETMEZ', async () => {
  const created = await newRequirement({ assigneeId: personA.id });
  await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeId: personA.id,
  });
  assert.equal((await assignAudits(projA.id, created.body.id)).length, 1);
});

test('PUT /requirements/:id — BASKA projenin personeline atanamaz', async () => {
  const created = await newRequirement();
  const res = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeId: personB.id,
  });
  assert.equal(res.status, 400);
});

test('POST/PUT /testcases — atama ayni kurallarla calisir', async () => {
  const created = await auth(request(app).post(`/api/projects/${projA.id}/testcases`)).send({
    title: 'Atanacak test',
    type: 'System Test',
    assigneeId: personA.id,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.assigneeId, personA.id);
  assert.equal((await assignAudits(projA.id, created.body.id)).length, 1);

  const bad = await auth(request(app).put(`/api/projects/${projA.id}/testcases/${created.body.id}`)).send({
    assigneeId: personB.id,
  });
  assert.equal(bad.status, 400);

  const ok = await auth(request(app).put(`/api/projects/${projA.id}/testcases/${created.body.id}`)).send({
    assigneeId: personA2.id,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.assigneeId, personA2.id);
});

test('Personel silinince atama bosa duser, kayit SILINMEZ', async () => {
  const victim = await createPersonnel(projA.id, 'Silinecek', 'Kisi', 'ASG09');
  const created = await newRequirement({ assigneeId: victim.id });

  await auth(request(app).delete(`/api/projects/${projA.id}/personnel/${victim.id}`)).send({
    reason: 'Projeden ayrildi',
  });

  const after = await prisma.requirement.findUnique({ where: { id: created.body.id } });
  assert.ok(after, 'gereksinim silinmemeli');
  assert.equal(after.assigneeId, null);
});

test('GET /personnel — personel oturumu passcode GORMEZ, PM gorur', async () => {
  const asPersonnel = await auth(request(app).get(`/api/projects/${projA.id}/personnel`), personnelToken);
  assert.equal(asPersonnel.status, 200);
  assert.ok(asPersonnel.body.length > 0);
  for (const p of asPersonnel.body) {
    assert.equal(p.passcode, undefined, 'passcode personele sizmamali');
    assert.ok(p.firstName, "ad alanlari korunmali (atama dropdown'i bunlari kullanir)");
  }

  const asPm = await auth(request(app).get(`/api/projects/${projA.id}/personnel`));
  assert.equal(asPm.status, 200);
  assert.ok(
    asPm.body.every((p) => typeof p.passcode === 'string'),
    'PM unutulan kodu kurtarabilmeli',
  );
});
