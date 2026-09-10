// ============================================================================
//  delete-reason.test.js — Silme gerekcesi (izlenebilirlik) zorunlulugu.
//  Kapsam: `reason` yoksa/kisaysa 400 (kayit SILINMEZ), gecerliyse silinir ve
//  AuditLog.reason'a yazilir; proje silme icin ayri (FK'siz, kalici)
//  ProjectDeletionLog + PM-only GET /api/project-deletions.
// ============================================================================
import { resetDb } from './_setup.js';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

let proj;
let pmToken;
let memberToken;

before(async () => {
  resetDb();

  const { hashPassword, signToken } = await import('../src/auth.js');
  const user = await prisma.user.create({
    data: {
      username: 'pm-delreason',
      passwordHash: await hashPassword('pm-pass'),
      name: 'PM',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
    },
  });
  // Issue #101: token'da kanonik alan `roleKey`'tir (kind/isPM kaldirildi).
  pmToken = signToken({ userId: user.id, roleKey: 'pm', clearanceLevel: 5 });

  proj = await prisma.project.create({ data: { name: 'Gerekce Proje', description: 'Test' } });

  // Issue #97/A: normal uye artik User'dir (Personnel kalkti); proje erisimi
  // ProjectMember ile kurulur, yetki SystemRole'den (developer) gelir.
  const member = await prisma.user.create({
    data: {
      username: 'member-delreason',
      passwordHash: await hashPassword('member-pass'),
      name: 'A B',
      role: 'Developer',
      roleKey: 'developer',
    },
  });
  await prisma.projectMember.create({ data: { projectId: proj.id, userId: member.id } });
  memberToken = signToken({ userId: member.id, roleKey: 'developer', clearanceLevel: 1 });
});

after(async () => {
  await prisma.$disconnect();
});

const asPM = (r) => r.set('Authorization', `Bearer ${pmToken}`);

// --- Tek kayit silme: Field (audit hic yoktu, hem audit hem reason eklendi) ----

test('DELETE /fields/:id — reason olmadan 400 doner, kayit SILINMEZ', async () => {
  const field = await prisma.projectField.create({ data: { projectId: proj.id, name: 'Alan-1' } });
  const res = await asPM(request(app).delete(`/api/projects/${proj.id}/fields/${field.id}`));
  assert.equal(res.status, 400);
  const still = await prisma.projectField.findUnique({ where: { id: field.id } });
  assert.ok(still, 'reason olmadan alan silinmemeli');
});

test('DELETE /fields/:id — 2 karakterlik reason 400 doner (min 3)', async () => {
  const field = await prisma.projectField.create({ data: { projectId: proj.id, name: 'Alan-2' } });
  const res = await asPM(request(app).delete(`/api/projects/${proj.id}/fields/${field.id}`).send({ reason: 'ab' }));
  assert.equal(res.status, 400);
});

test('DELETE /fields/:id — gecerli reason ile silinir ve AuditLog.reason + actor yazilir', async () => {
  const field = await prisma.projectField.create({ data: { projectId: proj.id, name: 'Alan-3' } });
  const res = await asPM(
    request(app)
      .delete(`/api/projects/${proj.id}/fields/${field.id}`)
      .send({ reason: 'Yanlis girilmis, kapsam disi.' }),
  );
  assert.equal(res.status, 200);
  assert.equal(await prisma.projectField.findUnique({ where: { id: field.id } }), null);

  const logs = await prisma.auditLog.findMany({
    where: { projectId: proj.id, entityType: 'field', entityId: field.id },
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].reason, 'Yanlis girilmis, kapsam disi.');
  assert.ok(logs[0].actor, 'actor doldurulmali');
});

// --- Requirement: tek + toplu silme --------------------------------------------

test('DELETE /requirements/:id — reason olmadan 400 doner', async () => {
  const req = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-DR1', title: 'T', type: 'User Requirement' },
  });
  const res = await asPM(request(app).delete(`/api/projects/${proj.id}/requirements/${req.id}`));
  assert.equal(res.status, 400);
  assert.ok(await prisma.requirement.findUnique({ where: { id: req.id } }));
});

test('POST /requirements/batch-delete — reason olmadan 400 doner, hicbir kayit silinmez', async () => {
  const r1 = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-DR2', title: 'T2', type: 'User Requirement' },
  });
  const r2 = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-DR3', title: 'T3', type: 'User Requirement' },
  });
  const res = await asPM(
    request(app)
      .post(`/api/projects/${proj.id}/requirements/batch-delete`)
      .send({ ids: [r1.id, r2.id] }),
  );
  assert.equal(res.status, 400);
  assert.equal(await prisma.requirement.count({ where: { id: { in: [r1.id, r2.id] } } }), 2);
});

test('POST /requirements/batch-delete — gecerli reason ile silinir, her satira reason yazilir', async () => {
  const r1 = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-DR4', title: 'T4', type: 'User Requirement' },
  });
  const r2 = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-DR5', title: 'T5', type: 'User Requirement' },
  });
  const res = await asPM(
    request(app)
      .post(`/api/projects/${proj.id}/requirements/batch-delete`)
      .send({ ids: [r1.id, r2.id], reason: 'Kapsam disi birakildi.' }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.deleted, 2);

  const logs = await prisma.auditLog.findMany({
    where: { projectId: proj.id, entityId: { in: [r1.id, r2.id] } },
  });
  assert.equal(logs.length, 2);
  for (const l of logs) assert.equal(l.reason, 'Kapsam disi birakildi.');
});

// --- Sozluk terimi (Issue #97: proje-bazli Role CRUD kaldirildi) -------------

test('DELETE /glossary/:id — PM + gecerli reason ile silinir, AuditLog.reason yazilir', async () => {
  const term = await prisma.glossaryTerm.create({
    data: { projectId: proj.id, text_id: 'GLO-DEL-1', term: 'Silinecek Terim' },
  });
  const res = await asPM(
    request(app).delete(`/api/projects/${proj.id}/glossary/${term.id}`).send({ reason: 'Artik kullanilmiyor.' }),
  );
  assert.equal(res.status, 200);
  const log = await prisma.auditLog.findFirst({ where: { projectId: proj.id, entityId: term.id } });
  assert.equal(log.reason, 'Artik kullanilmiyor.');
});

// --- Proje silme: FK'siz kalici log + PM-only goruntuleme ----------------------

test('DELETE /projects/:pid — reason olmadan 400 doner, proje silinmez', async () => {
  const p = await prisma.project.create({ data: { name: 'Silinecek Proje 1' } });
  const res = await asPM(request(app).delete(`/api/projects/${p.id}`));
  assert.equal(res.status, 400);
  assert.ok(await prisma.project.findUnique({ where: { id: p.id } }));
});

test('DELETE /projects/:pid — gecerli reason ile silinir; ProjectDeletionLog KALICI kalir (AuditLog gibi cascade gitmez)', async () => {
  const p = await prisma.project.create({ data: { name: 'Silinecek Proje 2' } });
  const res = await asPM(request(app).delete(`/api/projects/${p.id}`).send({ reason: 'Proje iptal edildi.' }));
  assert.equal(res.status, 200);
  assert.equal(await prisma.project.findUnique({ where: { id: p.id } }), null);

  const log = await prisma.projectDeletionLog.findFirst({ where: { projectId: p.id } });
  assert.ok(log, 'ProjectDeletionLog kaydi olmali');
  assert.equal(log.reason, 'Proje iptal edildi.');
  assert.equal(log.projectName, 'Silinecek Proje 2');
});

test('GET /api/project-deletions — yalnizca PM erisebilir', async () => {
  const asPersonnel = await request(app).get('/api/project-deletions').set('Authorization', `Bearer ${memberToken}`);
  assert.equal(asPersonnel.status, 403);

  const asPmRes = await asPM(request(app).get('/api/project-deletions'));
  assert.equal(asPmRes.status, 200);
  assert.ok(Array.isArray(asPmRes.body));
  assert.ok(asPmRes.body.some((r) => r.projectName === 'Silinecek Proje 2'));
});
