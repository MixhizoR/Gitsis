// ============================================================================
//  documents.test.js — Backend API testleri: Dokuman Kutuphanesi.
//  Kapsam: PDF/Excel yukleme, kalicilik (liste), indirme, tip reddi, proje
//  izolasyonu (IDOR), silme yetkisi, AuditLog kaydi ve proje cascade'i.
//
//  Calistirma: npm test tests/documents.test.js
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

const PM_CREDENTIALS = { username: 'pm-docs', password: 'pm-docs-pass-1234' };
let pmToken = null;
let projA = null;
let projB = null;
let personnelToken = null;

// Icerik onemsiz; mimeType uzantidan belirlenir (tarayici tipine guvenilmez).
const PDF_BYTES = Buffer.from('%PDF-1.4 sahte-pdf-icerigi');
const XLSX_BYTES = Buffer.from('PK sahte-xlsx-icerigi');

before(async () => {
  resetDb();

  const { hashPassword } = await import('../src/auth.js');

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      passwordHash: await hashPassword(PM_CREDENTIALS.password),
      name: 'Dokuman Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  projA = await prisma.project.create({ data: { name: 'Dokuman Projesi A' } });
  projB = await prisma.project.create({ data: { name: 'Dokuman Projesi B' } });

  // Silme izni OLMAYAN personel (yalnizca okuma) — B projesine atanir.
  const role = await prisma.role.create({
    data: { projectId: projB.id, name: 'Okuyucu', permissions: { read: { enabled: true } } },
  });
  await prisma.personnel.create({
    data: {
      projectId: projB.id,
      roleId: role.id,
      firstName: 'Deniz',
      lastName: 'Yilmaz',
      passcode: 'DOC12',
    },
  });

  const login = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = login.body.token;
  const pass = await request(app).post('/api/auth/passcode').send({ passcode: 'DOC12' });
  personnelToken = pass.body.token;
});

after(async () => {
  await prisma.$disconnect();
});

// --- Kimlik dogrulama -------------------------------------------------------

test('GET /documents — tokensiz 401 dondurur', async () => {
  const res = await request(app).get(`/api/projects/${projA.id}/documents`);
  assert.equal(res.status, 401);
});

// --- Yukleme + kalicilik ----------------------------------------------------

test('POST /documents — PDF yuklenir ve listede kalici olarak gorunur', async () => {
  const res = await request(app)
    .post(`/api/projects/${projA.id}/documents`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', PDF_BYTES, 'Sistem_Gereksinim_Dokumani_v1.0.pdf');

  assert.equal(res.status, 201);
  assert.equal(res.body.fileName, 'Sistem_Gereksinim_Dokumani_v1.0.pdf');
  assert.equal(res.body.ext, '.pdf');
  assert.equal(res.body.mimeType, 'application/pdf');
  assert.equal(res.body.size, PDF_BYTES.length);
  assert.equal(res.body.uploadedBy, 'Dokuman Test PM');
  // Icerik (bytea) yanitlarda ASLA donmez.
  assert.equal(res.body.content, undefined);

  const list = await request(app).get(`/api/projects/${projA.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, res.body.id);
});

test('POST /documents — ikinci belge (xlsx) kutuphaneye EKLENIR, oncekini silmez', async () => {
  const res = await request(app)
    .post(`/api/projects/${projA.id}/documents`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', XLSX_BYTES, 'izlenebilirlik.xlsx');

  assert.equal(res.status, 201);
  assert.equal(res.body.ext, '.xlsx');
  assert.equal(res.body.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const list = await request(app).get(`/api/projects/${projA.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(list.body.length, 2);
  // En yeni ustte (createdAt desc).
  assert.equal(list.body[0].fileName, 'izlenebilirlik.xlsx');
});

test('POST /documents — desteklenmeyen uzanti 415 ile reddedilir', async () => {
  const res = await request(app)
    .post(`/api/projects/${projA.id}/documents`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from('zararli'), 'script.exe');

  assert.equal(res.status, 415);
  const list = await request(app).get(`/api/projects/${projA.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(list.body.length, 2, 'reddedilen dosya kutuphaneye eklenmemeli');
});

test('POST /documents — dosyasiz istek 400 dondurur', async () => {
  const res = await request(app)
    .post(`/api/projects/${projA.id}/documents`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('description', 'dosya yok');
  assert.equal(res.status, 400);
});

// --- Indirme ----------------------------------------------------------------

test('GET /documents/:id/download — orijinal icerigi ve dosya adini dondurur', async () => {
  const list = await request(app).get(`/api/projects/${projA.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  const pdf = list.body.find((d) => d.ext === '.pdf');

  const res = await request(app)
    .get(`/api/projects/${projA.id}/documents/${pdf.id}/download`)
    .set('Authorization', `Bearer ${pmToken}`)
    .buffer()
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], /Sistem_Gereksinim_Dokumani_v1\.0\.pdf/);
  assert.deepEqual(res.body, PDF_BYTES);
});

// --- Proje izolasyonu (IDOR) ------------------------------------------------

test('GET /documents — belgeler proje bazli izole edilir', async () => {
  const listB = await request(app).get(`/api/projects/${projB.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(listB.status, 200);
  assert.equal(listB.body.length, 0, 'A projesinin belgeleri B projesinde gorunmemeli');
});

test('GET /documents — personel baska projenin belgelerine erisemez', async () => {
  const res = await request(app)
    .get(`/api/projects/${projA.id}/documents`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 403);
});

// --- Silme ------------------------------------------------------------------

test('DELETE /documents/:id — silme izni olmayan personel 403 alir', async () => {
  const created = await request(app)
    .post(`/api/projects/${projB.id}/documents`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', PDF_BYTES, 'b-projesi.pdf');
  assert.equal(created.status, 201);

  const res = await request(app)
    .delete(`/api/projects/${projB.id}/documents/${created.body.id}`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 403);

  const still = await request(app).get(`/api/projects/${projB.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(still.body.length, 1);
});

test('DELETE /documents/:id — PM siler ve AuditLog kaydi olusur', async () => {
  const list = await request(app).get(`/api/projects/${projB.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  const doc = list.body[0];

  const res = await request(app)
    .delete(`/api/projects/${projB.id}/documents/${doc.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ reason: 'Test verisi temizligi.' });
  assert.equal(res.status, 200);

  const remaining = await request(app)
    .get(`/api/projects/${projB.id}/documents`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(remaining.body.length, 0);

  const logs = await prisma.auditLog.findMany({ where: { projectId: projB.id } });
  assert.ok(logs.some((l) => l.action === 'DOCUMENT_UPLOAD'));
  const deleteLog = logs.find((l) => l.action === 'DOCUMENT_DELETE');
  assert.ok(deleteLog);
  assert.equal(deleteLog.reason, 'Test verisi temizligi.');
});

test('DELETE /documents/:id — baska projenin belgesi 404 dondurur', async () => {
  const list = await request(app).get(`/api/projects/${projA.id}/documents`).set('Authorization', `Bearer ${pmToken}`);
  const doc = list.body[0];

  const res = await request(app)
    .delete(`/api/projects/${projB.id}/documents/${doc.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 404);
});

// --- Proje silinince belgeler de silinir (cascade) --------------------------

test('Proje silinince belgeleri de cascade ile temizlenir', async () => {
  const tmp = await prisma.project.create({ data: { name: 'Gecici Dokuman Projesi' } });
  await request(app)
    .post(`/api/projects/${tmp.id}/documents`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', PDF_BYTES, 'gecici.pdf');

  await prisma.project.delete({ where: { id: tmp.id } });
  const rows = await prisma.projectDocument.findMany({ where: { projectId: tmp.id } });
  assert.equal(rows.length, 0);
});
