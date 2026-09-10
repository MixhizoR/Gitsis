// ============================================================================
//  comments.test.js — Backend API testleri: ana varliklarda YORUMLAR.
//  Kapsam: generic entityType+entityId, yazarin SUNUCUDA belirlenmesi,
//  bos yorum reddi, proje izolasyonu (IDOR), silme yetkisi (yazar / PM /
//  baskasi), zorunlu gerekce + AuditLog kaydi ve proje cascade'i.
//
//  Calistirma: npm test tests/comments.test.js
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
// Ortak env + DB reset (tek dogruluk kaynagi: tests/_setup.js).
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-comments', password: 'pm-comments-pass-1234' };
let pmToken = null;
let memberToken = null;
let projA = null;
let projB = null;
let reqA = null; // projA'daki gereksinim
let reqB = null; // projB'deki gereksinim (IDOR testi)
let glossaryA = null;
let memberUserA = null;

before(async () => {
  resetDb();

  const { hashPassword } = await import('../src/auth.js');
  const { ensureSystemRoles } = await import('../src/systemRoles.js');
  // Issue #97: rol/izinler SystemRole'den gelir; cekirdek roller seed'lenmeli.
  await ensureSystemRoles(prisma);

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      passwordHash: await hashPassword(PM_CREDENTIALS.password),
      name: 'Yorum Test PM',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
    },
  });

  projA = await prisma.project.create({ data: { name: 'Yorum Projesi A' } });
  projB = await prisma.project.create({ data: { name: 'Yorum Projesi B' } });

  reqA = await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-001',
      title: 'Yorumlanacak gereksinim',
      type: 'System Requirement',
    },
  });
  reqB = await prisma.requirement.create({
    data: {
      projectId: projB.id,
      text_id: 'REQ-SYS-002',
      title: 'Baska projenin gereksinimi',
      type: 'System Requirement',
    },
  });
  glossaryA = await prisma.glossaryTerm.create({
    data: { projectId: projA.id, text_id: 'GLO-001', term: 'Espresso' },
  });

  // Sistem gereksinimlerini OKUYABILEN uye (SystemRole 'system_engineer'
  // read=ALL_COMPONENTS) — yorum yazabilmeli. Issue #97/A: kimlik User'dir;
  // proje erisimi ProjectMember ile kurulur.
  const memberA = await prisma.user.create({
    data: {
      username: 'member-comments',
      passwordHash: await hashPassword('member-comments-pass-1234'),
      name: 'Ayse Demir',
      role: 'System Engineer',
      roleKey: 'system_engineer',
    },
  });
  memberUserA = memberA;
  await prisma.projectMember.create({ data: { projectId: projA.id, userId: memberA.id } });

  const login = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = login.body.accessToken;
  const memberLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'member-comments', password: 'member-comments-pass-1234' });
  memberToken = memberLogin.body.accessToken;
});

after(async () => {
  await prisma.$disconnect();
});

const asPM = (r) => r.set('Authorization', `Bearer ${pmToken}`);
const asMember = (r) => r.set('Authorization', `Bearer ${memberToken}`);

// --- Kimlik dogrulama -------------------------------------------------------

test('GET /comments — tokensiz 401 dondurur', async () => {
  const res = await request(app).get(`/api/projects/${projA.id}/comments`);
  assert.equal(res.status, 401);
});

// --- Ekleme -----------------------------------------------------------------

test('POST /comments — PM yorum ekler; yazar SUNUCUDA belirlenir', async () => {
  const res = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: '  Kabul kriterlerini netlestirebilir miyiz?  ',
    // Istemci kimlige burunmeye calisiyor — YOK SAYILMALI.
    authorId: 'sahte-kullanici',
    authorName: 'Sahte Kisi',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.entityType, 'requirement');
  assert.equal(res.body.entityId, reqA.id);
  // Metin trim'lenir.
  assert.equal(res.body.text, 'Kabul kriterlerini netlestirebilir miyiz?');
  // Yazar istemciden DEGIL, oturumdan gelir.
  assert.notEqual(res.body.authorId, 'sahte-kullanici');
  assert.equal(res.body.authorName, 'Yorum Test PM');
  assert.equal(res.body.authorRole, 'Proje Yöneticisi');
});

test('POST /comments — okuma yetkisi olan personel yorum ekleyebilir (rolu ile)', async () => {
  const res = await asMember(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: 'Ilgili kismi guncelledim.',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.authorId, memberUserA.id);
  assert.equal(res.body.authorName, 'Ayse Demir');
  // Rol yanitta yer alir (UI yorumun yaninda gosterir).
  assert.equal(res.body.authorRole, 'System Engineer');
});

test('POST /comments — bos / yalnizca bosluk iceren yorum reddedilir', async () => {
  for (const text of ['', '   ', '\n\t ']) {
    const res = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
      entityType: 'requirement',
      entityId: reqA.id,
      text,
    });
    assert.equal(res.status, 400, `bos metin kabul edilmemeli: ${JSON.stringify(text)}`);
  }
});

test('POST /comments — gecersiz entityType reddedilir', async () => {
  const res = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'proje',
    entityId: reqA.id,
    text: 'gecersiz tip',
  });
  assert.equal(res.status, 400);
});

test('POST /comments — BASKA projenin kaydina yorum yazilamaz (IDOR)', async () => {
  const res = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqB.id, // projB'nin gereksinimi
    text: 'baska projenin kaydi',
  });
  assert.equal(res.status, 404);
});

test('POST /comments — sozluk terimi de yorumlanabilir (generic yapi)', async () => {
  const res = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'glossary',
    entityId: glossaryA.id,
    text: 'Bu terimin tanimi genisletilmeli.',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.entityType, 'glossary');
});

// --- Listeleme --------------------------------------------------------------

test('GET /comments — entityType + entityId ile filtreler, kronolojik siralar', async () => {
  const res = await asPM(
    request(app).get(`/api/projects/${projA.id}/comments?entityType=requirement&entityId=${reqA.id}`),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2, 'yalnizca bu gereksinimin yorumlari');
  assert.ok(res.body.every((c) => c.entityId === reqA.id));
  // Eskiden yeniye.
  assert.ok(new Date(res.body[0].createdAt) <= new Date(res.body[1].createdAt));
  assert.equal(res.body[0].authorName, 'Yorum Test PM');
});

test('GET /comments — filtresiz cagri projenin tum yorumlarini dondurur', async () => {
  const res = await asPM(request(app).get(`/api/projects/${projA.id}/comments`));
  assert.equal(res.status, 200);
  // 2 gereksinim yorumu + 1 sozluk yorumu.
  assert.equal(res.body.length, 3);
});

test('GET /comments — yalnizca entityType verilirse 400', async () => {
  const res = await asPM(request(app).get(`/api/projects/${projA.id}/comments?entityType=requirement`));
  assert.equal(res.status, 400);
});

test('GET /comments — personel baska projenin yorumlarini goremez', async () => {
  const res = await asMember(request(app).get(`/api/projects/${projB.id}/comments`));
  assert.equal(res.status, 403);
});

// --- Silme: yetki + zorunlu gerekce + audit ---------------------------------

test('DELETE /comments/:id — gerekce olmadan silinemez', async () => {
  const created = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: 'gerekcesiz silme denemesi',
  });

  const res = await asPM(request(app).delete(`/api/projects/${projA.id}/comments/${created.body.id}`)).send({});
  assert.equal(res.status, 400);

  // Kayit DURUYOR olmali.
  const still = await prisma.comment.findUnique({ where: { id: created.body.id } });
  assert.ok(still);
});

test('DELETE /comments/:id — kullanici KENDI yorumunu silebilir', async () => {
  const created = await asMember(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: 'kendi yorumum',
  });

  const res = await asMember(request(app).delete(`/api/projects/${projA.id}/comments/${created.body.id}`)).send({
    reason: 'Yanlislikla yazdim.',
  });
  assert.equal(res.status, 200);

  const gone = await prisma.comment.findUnique({ where: { id: created.body.id } });
  assert.equal(gone, null);
});

test('DELETE /comments/:id — BASKASININ yorumu silinemez (403)', async () => {
  const pmComment = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: "PM'in yorumu",
  });

  const res = await asMember(request(app).delete(`/api/projects/${projA.id}/comments/${pmComment.body.id}`)).send({
    reason: 'Silmek istiyorum.',
  });
  assert.equal(res.status, 403);

  const still = await prisma.comment.findUnique({ where: { id: pmComment.body.id } });
  assert.ok(still, 'yorum silinmemis olmali');
});

test('DELETE /comments/:id — PM baskasinin yorumunu silebilir + AuditLog yazilir', async () => {
  const personnelComment = await asMember(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: 'PM tarafindan silinecek',
  });

  const res = await asPM(request(app).delete(`/api/projects/${projA.id}/comments/${personnelComment.body.id}`)).send({
    reason: 'Konu disi yorum.',
  });
  assert.equal(res.status, 200);

  // MEVCUT AuditLog kullanilir (paralel bir denetim mekanizmasi yok).
  const log = await prisma.auditLog.findFirst({
    where: { projectId: projA.id, action: 'COMMENT_DELETE', entityId: personnelComment.body.id },
  });
  assert.ok(log, 'audit kaydi olusmali');
  assert.equal(log.reason, 'Konu disi yorum.');
  assert.equal(log.entityType, 'comment');
  // Yorumun hangi kayda ait oldugu izlenebilir.
  assert.equal(log.field, `requirement:${reqA.id}`);
  assert.equal(log.actor, 'Yorum Test PM');
  assert.match(log.oldValue, /PM tarafindan silinecek/);
});

test('DELETE /comments/:id — baska projenin yorumu 404', async () => {
  const created = await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: 'projA yorumu',
  });

  const res = await asPM(request(app).delete(`/api/projects/${projB.id}/comments/${created.body.id}`)).send({
    reason: 'Yanlis proje uzerinden silme.',
  });
  assert.equal(res.status, 404);
});

// --- Onay surecinden bagimsizlik + cascade ----------------------------------

test('Yorum eklemek kaydin durumunu/onayini DEGISTIRMEZ', async () => {
  const before = await prisma.requirement.findUnique({ where: { id: reqA.id } });
  await asPM(request(app).post(`/api/projects/${projA.id}/comments`)).send({
    entityType: 'requirement',
    entityId: reqA.id,
    text: 'durum degismemeli',
  });
  const after = await prisma.requirement.findUnique({ where: { id: reqA.id } });
  assert.equal(after.status, before.status);
  assert.equal(after.approvalStatus, before.approvalStatus);
  assert.equal(after.locked, before.locked);
});

test('Proje silinince yorumlari da cascade ile temizlenir', async () => {
  const tmp = await prisma.project.create({ data: { name: 'Gecici Yorum Projesi' } });
  const r = await prisma.requirement.create({
    data: {
      projectId: tmp.id,
      text_id: 'REQ-SYS-001',
      title: 'gecici',
      type: 'System Requirement',
    },
  });
  await asPM(request(app).post(`/api/projects/${tmp.id}/comments`)).send({
    entityType: 'requirement',
    entityId: r.id,
    text: 'gecici yorum',
  });

  await prisma.project.delete({ where: { id: tmp.id } });
  const rows = await prisma.comment.findMany({ where: { projectId: tmp.id } });
  assert.equal(rows.length, 0);
});
