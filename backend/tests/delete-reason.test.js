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
let personnelToken;

before(async () => {
  resetDb();

  const { hashPassword, signToken } = await import('../src/auth.js');
  const user = await prisma.user.create({
    data: {
      username: 'pm-delreason',
      passwordHash: await hashPassword('pm-pass'),
      name: 'PM',
      role: 'Proje Yöneticisi',
    },
  });
  pmToken = signToken({ kind: 'pm', isPM: true, userId: user.id });

  proj = await prisma.project.create({ data: { name: 'Gerekce Proje', description: 'Test' } });

  const role = await prisma.role.create({ data: { projectId: proj.id, name: 'Muhendis', permissions: {} } });
  const person = await prisma.personnel.create({
    data: { projectId: proj.id, roleId: role.id, firstName: 'A', lastName: 'B', passcode: 'DR-1' },
  });
  personnelToken = signToken({ kind: 'personnel', isPM: false, projectId: proj.id, personnelId: person.id });
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

// --- Rol -------------------------------------------------------------------

test('DELETE /roles/:id — PM + gecerli reason ile silinir', async () => {
  const role = await prisma.role.create({ data: { projectId: proj.id, name: 'Silinecek Rol 2', permissions: {} } });
  const res = await asPM(
    request(app).delete(`/api/projects/${proj.id}/roles/${role.id}`).send({ reason: 'Artik kullanilmiyor.' }),
  );
  assert.equal(res.status, 200);
  const log = await prisma.auditLog.findFirst({ where: { projectId: proj.id, entityId: role.id } });
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
  const asPersonnel = await request(app).get('/api/project-deletions').set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(asPersonnel.status, 403);

  const asPmRes = await asPM(request(app).get('/api/project-deletions'));
  assert.equal(asPmRes.status, 200);
  assert.ok(Array.isArray(asPmRes.body));
  assert.ok(asPmRes.body.some((r) => r.projectName === 'Silinecek Proje 2'));
});
