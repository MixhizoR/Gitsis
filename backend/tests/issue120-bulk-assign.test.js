// ============================================================================
//  issue120-bulk-assign.test.js — Listeden coklu secimle TOPLU kisi atama.
//
//  Kapsam:
//   - applyAssignMode / sameAssignees saf mantigi (add / replace / remove)
//   - POST /requirements/batch-assign ve /testcases/batch-assign
//   - Kilitli (onaylanmis) kayitlar ATLANIR; yanit "kac atlandi" bildirir
//   - Zaten istenen haldeki kayitlar "unchanged" sayilir, bosuna yazilmaz
//   - Sira korunur: 'add' birincil sorumluyu degistirmez
//   - Proje siniri: baska projenin kullanicisi atanamaz (400)
//   - ABAC (#87): clearance ustundeki gereksinimler sessizce atlanir
//   - Her DEGISEN kayit icin ASSIGN denetim kaydi yazilir
//
//  Calistirma: npm test tests/issue120-bulk-assign.test.js
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
import './_setup.js';
import { resetDb } from './_setup.js';
import { applyAssignMode, sameAssignees } from '../src/assignees.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM = { username: 'pm-bulk-assign', password: 'pm-bulk-assign-pass-1234' };
let pmToken = null;
let lowToken = null; // clearance 1 kullanici (ABAC testi)
let proj = null;
let other = null; // IDOR testi icin ikinci proje
let userA = null;
let userB = null;
let userC = null;
let userOther = null;

const auth = (req, token = pmToken) => req.set('Authorization', `Bearer ${token}`);

const createMember = async (projectId, name, clearanceLevel = 5) => {
  const { hashPassword } = await import('../src/auth.js');
  const user = await prisma.user.create({
    data: {
      username: `bulk-${Math.random().toString(36).slice(2, 10)}`,
      passwordHash: await hashPassword('member-pass-1234'),
      name,
      role: 'System Engineer',
      roleKey: 'system_engineer',
      clearanceLevel,
    },
  });
  await prisma.projectMember.create({ data: { projectId, userId: user.id } });
  return user;
};

const newRequirement = async (body = {}) =>
  auth(request(app).post(`/api/projects/${proj.id}/requirements`)).send({
    title: 'Toplu atama gereksinimi',
    type: 'System Requirement',
    ...body,
  });

const batchAssign = (body, token = pmToken) =>
  auth(request(app).post(`/api/projects/${proj.id}/requirements/batch-assign`), token).send(body);

const assigneeIdsOf = async (requirementId) => {
  const rows = await prisma.requirementAssignee.findMany({
    where: { requirementId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
};

before(async () => {
  resetDb();
  const { hashPassword, signToken } = await import('../src/auth.js');
  const { ensureSystemRoles } = await import('../src/systemRoles.js');
  await ensureSystemRoles(prisma);

  await prisma.user.create({
    data: {
      username: PM.username,
      passwordHash: await hashPassword(PM.password),
      name: 'Toplu Atama PM',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
      clearanceLevel: 5,
    },
  });

  proj = await prisma.project.create({ data: { name: 'Toplu Atama Projesi' } });
  other = await prisma.project.create({ data: { name: 'Baska Proje' } });

  userA = await createMember(proj.id, 'Ayse Demir');
  userB = await createMember(proj.id, 'Mehmet Kaya');
  userC = await createMember(proj.id, 'Zeynep Ak');
  userOther = await createMember(other.id, 'Yabanci Kullanici');

  const login = await request(app).post('/api/auth/login').send(PM);
  pmToken = login.body.accessToken;
  // Clearance 1 kullanici: yalnizca seviye 1 gereksinimleri gorur.
  const low = await createMember(proj.id, 'Dusuk Yetki', 1);
  lowToken = signToken({ userId: low.id, roleKey: 'system_engineer', clearanceLevel: 1 });
});

after(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
//  Saf mantik (DB gerekmez): mod davranislari
// ---------------------------------------------------------------------------
test('applyAssignMode — "add" mevcutlarin sonuna ekler, birincil sorumluyu korur', () => {
  assert.deepEqual(applyAssignMode(['a', 'b'], ['c'], 'add'), ['a', 'b', 'c']);
  // Zaten atanmis kisi yinelenmez ve sirasi degismez.
  assert.deepEqual(applyAssignMode(['a', 'b'], ['a', 'c'], 'add'), ['a', 'b', 'c']);
  // Bos mevcutta secim sirasi aynen korunur.
  assert.deepEqual(applyAssignMode([], ['b', 'a'], 'add'), ['b', 'a']);
});

test('applyAssignMode — "replace" mevcutlari siler, "remove" secilenleri cikarir', () => {
  assert.deepEqual(applyAssignMode(['a', 'b'], ['c', 'd'], 'replace'), ['c', 'd']);
  assert.deepEqual(applyAssignMode(['a', 'b'], [], 'replace'), []);
  assert.deepEqual(applyAssignMode(['a', 'b', 'c'], ['b'], 'remove'), ['a', 'c']);
  // Atanmamis birini kaldirmak liste uzerinde etkisizdir.
  assert.deepEqual(applyAssignMode(['a'], ['z'], 'remove'), ['a']);
});

test('sameAssignees — SIRA degisimi de degisiklik sayilir', () => {
  assert.equal(sameAssignees(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameAssignees(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameAssignees([], []), true);
  assert.equal(sameAssignees(['a'], []), false);
});

// ---------------------------------------------------------------------------
//  Uc davranisi
// ---------------------------------------------------------------------------
test('POST /requirements/batch-assign — "add" secili kayitlara tek istekte atar', async () => {
  const r1 = await newRequirement();
  const r2 = await newRequirement();

  const res = await batchAssign({
    ids: [r1.body.id, r2.body.id],
    assigneeIds: [userA.id, userB.id],
    mode: 'add',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 2);
  assert.equal(res.body.skippedLocked, 0);
  // Sira korunur (ilk kisi birincil sorumlu, legacy kolon ona esitlenir).
  assert.deepEqual(await assigneeIdsOf(r1.body.id), [userA.id, userB.id]);
  const row = await prisma.requirement.findUnique({ where: { id: r1.body.id } });
  assert.equal(row.assigneeId, userA.id);
});

test('"add" mevcut atamayi EZMEZ; birincil sorumlu degismez', async () => {
  const r = await newRequirement({ assigneeIds: [userA.id] });

  const res = await batchAssign({ ids: [r.body.id], assigneeIds: [userC.id], mode: 'add' });

  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 1);
  assert.deepEqual(await assigneeIdsOf(r.body.id), [userA.id, userC.id]);
});

test('"replace" mevcut atamalari siler, yalnizca secilenleri birakir', async () => {
  const r = await newRequirement({ assigneeIds: [userA.id, userB.id] });

  const res = await batchAssign({ ids: [r.body.id], assigneeIds: [userC.id], mode: 'replace' });

  assert.equal(res.status, 200);
  assert.deepEqual(await assigneeIdsOf(r.body.id), [userC.id]);
});

test('"replace" + bos liste TUM atamalari kaldirir', async () => {
  const r = await newRequirement({ assigneeIds: [userA.id, userB.id] });

  const res = await batchAssign({ ids: [r.body.id], assigneeIds: [], mode: 'replace' });

  assert.equal(res.status, 200);
  assert.deepEqual(await assigneeIdsOf(r.body.id), []);
  const row = await prisma.requirement.findUnique({ where: { id: r.body.id } });
  assert.equal(row.assigneeId, null);
});

test('"remove" secilen kisiyi cikarir, kalanlarin sirasi korunur', async () => {
  const r = await newRequirement({ assigneeIds: [userA.id, userB.id, userC.id] });

  const res = await batchAssign({ ids: [r.body.id], assigneeIds: [userB.id], mode: 'remove' });

  assert.equal(res.status, 200);
  assert.deepEqual(await assigneeIdsOf(r.body.id), [userA.id, userC.id]);
});

test('zaten istenen haldeki kayit "unchanged" sayilir, denetim kaydi yazilmaz', async () => {
  const r = await newRequirement({ assigneeIds: [userA.id] });
  const beforeCount = await prisma.auditLog.count({
    where: { projectId: proj.id, action: 'ASSIGN', entityId: r.body.id },
  });

  const res = await batchAssign({ ids: [r.body.id], assigneeIds: [userA.id], mode: 'add' });

  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 0);
  assert.equal(res.body.unchanged, 1);
  const afterCount = await prisma.auditLog.count({
    where: { projectId: proj.id, action: 'ASSIGN', entityId: r.body.id },
  });
  assert.equal(afterCount, beforeCount);
});

test('kilitli (onaylanmis) kayitlar ATLANIR ve yanitta sayisi bildirilir', async () => {
  const open = await newRequirement();
  const locked = await newRequirement();
  await prisma.requirement.update({
    where: { id: locked.body.id },
    data: { locked: true, approvalStatus: 'Approved' },
  });

  const res = await batchAssign({
    ids: [open.body.id, locked.body.id],
    assigneeIds: [userA.id],
    mode: 'add',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 1);
  assert.equal(res.body.skippedLocked, 1);
  assert.deepEqual(await assigneeIdsOf(locked.body.id), []); // kilitliye dokunulmadi
  assert.deepEqual(await assigneeIdsOf(open.body.id), [userA.id]);
});

test('secimin TAMAMI kilitliyse 403 doner', async () => {
  const r = await newRequirement();
  await prisma.requirement.update({ where: { id: r.body.id }, data: { locked: true } });

  const res = await batchAssign({ ids: [r.body.id], assigneeIds: [userA.id], mode: 'add' });

  assert.equal(res.status, 403);
});

test('baska projenin kullanicisi atanamaz (proje siniri)', async () => {
  const r = await newRequirement();

  const res = await batchAssign({ ids: [r.body.id], assigneeIds: [userOther.id], mode: 'add' });

  assert.equal(res.status, 400);
  assert.deepEqual(await assigneeIdsOf(r.body.id), []);
});

test('ABAC (#87): clearance ustundeki gereksinim sessizce atlanir', async () => {
  const visible = await newRequirement({ clearanceLevel: 1 });
  const secret = await newRequirement({ clearanceLevel: 4 });

  // Clearance 1 kullanici her iki id'yi de gonderse bile yalnizca goreni degisir.
  const res = await auth(request(app).post(`/api/projects/${proj.id}/requirements/batch-assign`), lowToken).send({
    ids: [visible.body.id, secret.body.id],
    assigneeIds: [userA.id],
    mode: 'add',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 1);
  assert.equal(res.body.skippedHidden, 1);
  assert.deepEqual(await assigneeIdsOf(secret.body.id), []);
});

test('her DEGISEN kayit icin ASSIGN denetim kaydi yazilir', async () => {
  const r1 = await newRequirement();
  const r2 = await newRequirement();

  await batchAssign({ ids: [r1.body.id, r2.body.id], assigneeIds: [userA.id], mode: 'add' });

  for (const id of [r1.body.id, r2.body.id]) {
    const audits = await prisma.auditLog.findMany({
      where: { projectId: proj.id, action: 'ASSIGN', entityId: id },
    });
    assert.equal(audits.length, 1);
    assert.match(audits[0].message, /Ayse Demir/);
    assert.equal(audits[0].entityType, 'requirement');
  }
});

test('gecersiz mod ve bos id listesi 400 doner', async () => {
  const r = await newRequirement();

  const badMode = await batchAssign({ ids: [r.body.id], assigneeIds: [userA.id], mode: 'nope' });
  assert.equal(badMode.status, 400);

  const noIds = await batchAssign({ ids: [], assigneeIds: [userA.id], mode: 'add' });
  assert.equal(noIds.status, 400);

  // 'add' modunda kimse secilmemesi anlamsizdir.
  const noPeople = await batchAssign({ ids: [r.body.id], assigneeIds: [], mode: 'add' });
  assert.equal(noPeople.status, 400);
});

test('POST /testcases/batch-assign — testler icin de ayni sozlesme', async () => {
  const mk = () =>
    auth(request(app).post(`/api/projects/${proj.id}/testcases`)).send({
      title: 'Toplu atama testi',
      type: 'System Test',
    });
  const t1 = await mk();
  const t2 = await mk();

  const res = await auth(request(app).post(`/api/projects/${proj.id}/testcases/batch-assign`)).send({
    ids: [t1.body.id, t2.body.id],
    assigneeIds: [userB.id],
    mode: 'add',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 2);
  const rows = await prisma.testCaseAssignee.findMany({ where: { testCaseId: t1.body.id } });
  assert.deepEqual(
    rows.map((r) => r.userId),
    [userB.id],
  );
  const tc = await prisma.testCase.findUnique({ where: { id: t1.body.id } });
  assert.equal(tc.assigneeId, userB.id);
});
