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
      role: 'Proje Yöneticisi',
    },
  });

  projA = await prisma.project.create({ data: { name: 'Atama Projesi A' } });
  projB = await prisma.project.create({ data: { name: 'Atama Projesi B' } });

  personA = await createPersonnel(projA.id, 'Ayse', 'Demir', 'ASG01');
  personA2 = await createPersonnel(projA.id, 'Mehmet', 'Kaya', 'ASG02');
  personB = await createPersonnel(projB.id, 'Zeynep', 'Ak', 'ASG03');

  const login = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = login.body.accessToken;
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

// ===========================================================================
//  COKLU ATAMA (bir kayda birden fazla sorumlu)
//  Tek dogruluk kaynagi RequirementAssignee/TestCaseAssignee ara tablolaridir;
//  `assigneeId` kolonu daima listenin ILK elemanina esitlenir (eski istemci
//  uyumlulugu — bkz. src/assignees.js).
// ===========================================================================

test('POST /requirements — assigneeIds ile birden fazla kisi atanir, SIRA korunur', async () => {
  const res = await newRequirement({ assigneeIds: [personA2.id, personA.id] });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.assigneeIds, [personA2.id, personA.id]);
  // Legacy kolon listenin ILK elemani.
  assert.equal(res.body.assigneeId, personA2.id);

  const audits = await assignAudits(projA.id, res.body.id);
  assert.equal(audits.length, 1);
  assert.match(audits[0].message, /Mehmet Kaya/);
  assert.match(audits[0].message, /Ayse Demir/);
});

test('POST /requirements — tekrar eden id ayiklanir', async () => {
  const res = await newRequirement({ assigneeIds: [personA.id, personA.id, personA2.id] });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.assigneeIds, [personA.id, personA2.id]);
});

test('POST /requirements — listedeki TEK bir gecersiz id tum atamayi reddeder', async () => {
  const res = await newRequirement({ assigneeIds: [personA.id, personB.id] });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Gecersiz atama/);
});

test('PUT /requirements/:id — atanan kisi eklenip cikarilabilir', async () => {
  const created = await newRequirement({ assigneeIds: [personA.id] });

  const added = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeIds: [personA.id, personA2.id],
  });
  assert.equal(added.status, 200);
  assert.deepEqual(added.body.assigneeIds, [personA.id, personA2.id]);
  assert.equal(added.body.assigneeId, personA.id);

  const removed = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeIds: [],
  });
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.assigneeIds, []);
  assert.equal(removed.body.assigneeId, null);

  const audits = await assignAudits(projA.id, created.body.id);
  assert.equal(audits.length, 3); // olusturma + ekleme + kaldirma
  assert.match(audits[2].message, /kaldirildi/);
});

test('PUT /requirements/:id — yalnizca SIRA degisse bile ASSIGN kaydi yazilir', async () => {
  const created = await newRequirement({ assigneeIds: [personA.id, personA2.id] });
  const res = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeIds: [personA2.id, personA.id],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.assigneeIds, [personA2.id, personA.id]);
  assert.equal((await assignAudits(projA.id, created.body.id)).length, 2);
});

test('PUT /requirements/:id — ayni liste yeniden gonderilirse ASSIGN kaydi URETMEZ', async () => {
  const created = await newRequirement({ assigneeIds: [personA.id, personA2.id] });
  await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeIds: [personA.id, personA2.id],
  });
  assert.equal((await assignAudits(projA.id, created.body.id)).length, 1);
});

test('PUT /requirements/:id — assigneeIds gonderilmezse coklu atama KORUNUR', async () => {
  const created = await newRequirement({ assigneeIds: [personA.id, personA2.id] });
  const res = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    title: 'Yalnizca baslik degisti',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.assigneeIds, [personA.id, personA2.id]);
});

test('GET /requirements — liste yaniti assigneeIds tasir', async () => {
  const created = await newRequirement({ assigneeIds: [personA.id, personA2.id] });
  const list = await auth(request(app).get(`/api/projects/${projA.id}/requirements`));
  assert.equal(list.status, 200);
  const row = list.body.find((r) => r.id === created.body.id);
  assert.deepEqual(row.assigneeIds, [personA.id, personA2.id]);
  // Atamasi olmayan kayitlar bos dizi doner (undefined degil).
  const none = await newRequirement();
  const list2 = await auth(request(app).get(`/api/projects/${projA.id}/requirements`));
  assert.deepEqual(list2.body.find((r) => r.id === none.body.id).assigneeIds, []);
});

test('GET /requirements/:id — tekil yanit da assigneeIds tasir', async () => {
  const created = await newRequirement({ assigneeIds: [personA2.id, personA.id] });
  const one = await auth(request(app).get(`/api/projects/${projA.id}/requirements/${created.body.id}`));
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.assigneeIds, [personA2.id, personA.id]);
});

test('Eski istemci: tek assigneeId gonderimi tek elemanli listeye donusur', async () => {
  const created = await newRequirement({ assigneeId: personA.id });
  assert.deepEqual(created.body.assigneeIds, [personA.id]);

  const cleared = await auth(request(app).put(`/api/projects/${projA.id}/requirements/${created.body.id}`)).send({
    assigneeId: '',
  });
  assert.deepEqual(cleared.body.assigneeIds, []);
});

test('POST/PUT /testcases — coklu atama ayni kurallarla calisir', async () => {
  const created = await auth(request(app).post(`/api/projects/${projA.id}/testcases`)).send({
    title: 'Coklu atanacak test',
    type: 'System Test',
    assigneeIds: [personA.id, personA2.id],
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.assigneeIds, [personA.id, personA2.id]);
  assert.equal(created.body.assigneeId, personA.id);

  const rejected = await auth(request(app).put(`/api/projects/${projA.id}/testcases/${created.body.id}`)).send({
    assigneeIds: [personA.id, personB.id],
  });
  assert.equal(rejected.status, 400);

  const list = await auth(request(app).get(`/api/projects/${projA.id}/testcases`));
  assert.deepEqual(list.body.find((r) => r.id === created.body.id).assigneeIds, [personA.id, personA2.id]);
});

test('Coklu atamada ILK kisi silinince siradaki sorumlu yerine gecer', async () => {
  const victim = await createPersonnel(projA.id, 'Ayrilan', 'Sorumlu', 'ASG10');
  const created = await newRequirement({ assigneeIds: [victim.id, personA.id] });
  assert.equal(created.body.assigneeId, victim.id);

  await auth(request(app).delete(`/api/projects/${projA.id}/personnel/${victim.id}`)).send({
    reason: 'Projeden ayrildi',
  });

  const after = await auth(request(app).get(`/api/projects/${projA.id}/requirements/${created.body.id}`));
  assert.equal(after.status, 200);
  assert.deepEqual(after.body.assigneeIds, [personA.id], 'kalan sorumlu listede durmali');
  // Legacy kolon da tazelenir (SetNull ile bosaldigi yerde birakilmaz).
  const raw = await prisma.requirement.findUnique({ where: { id: created.body.id } });
  assert.equal(raw.assigneeId, personA.id);
});
