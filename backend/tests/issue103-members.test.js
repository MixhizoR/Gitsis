// ============================================================================
//  issue103-members.test.js — Issue #103: Proje Uyeligi Yonetimi (PM ekler).
//  Kapsam (spec Test Plani #9):
//    1) PM uye ekler -> GET /members listeler (isim, rol, clearance, joinedAt).
//    2) PM-olmayan kullanici /members -> 403 (okuma dahil — Karar #6).
//    3) PM, PM-role kullanici eklemeye calisir -> 400 (Karar #7).
//    4) Ayni kullanciyi ikinci kez ekleme -> idempotent (alreadyMember:true).
//    5) Uye olmayanin GET /requirements -> 403; GET /projects listesinde yok.
//    6) Uye cikarilir -> ayni token ile aninda 403; proje listesinden duser.
//    7) Cikarilan uyenin Approval kaydi korunur; matrix departed:true doner;
//       konsensus havuzundan duser (eksik oy -> Pending — Karar #9).
//    8) IDOR: cikarilan/uyesi olmayan kullanici B projesine erisemez.
//    9) POST/DELETE requirePM: uye 403; admin da uye ekleyemez (Karar #2).
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

const PM = { username: 'pm-issue103', password: 'pm-pass-103' };
// M: approve izni OLAN uye (system_engineer) — onay akisi icin uye.
const M = { username: 'member-issue103', password: 'member-pass-103' };
// DEP: once uye olur, sonra cikarilir (onay gecmisi + departed icin).
const DEP = { username: 'departed-issue103', password: 'departed-pass-103' };
// KEPT: aktif kalan AMA PM olmayan uye (403 senaryolari icin).
const KEPT = { username: 'kept-issue103', password: 'kept-pass-103' };
// PM2: roleKey='pm' kullanici — uye olarak EKLENEMEZ (Karar #7).
const PM2 = { username: 'pm2-issue103', password: 'pm2-pass-103' };
// STRANGER: normal kullanici; uye eklenen adaydir.
const STRANGER = { username: 'stranger-issue103', password: 'stranger-pass-103' };
// Yalnizca kullanici/rol yonetimi yapan admin — uye ekleyemez (Karar #2).
const ADMIN = { username: 'admin-issue103', password: 'admin-pass-103' };

let pidA;
let pidB;
let pmToken;
let pmUserId;
let mId;
let mToken;
let depId;
let depToken;
let keptToken;
let keptId;
let pm2Id;
let strangerId;
let strangerToken;
let adminToken;

async function login(creds) {
  const res = await request(app).post('/api/auth/login').send(creds);
  assert.equal(res.status, 200, `login (${creds.username}) -> 200`);
  return res.body;
}

before(async () => {
  resetDb();

  const { hashPassword } = await import('../src/auth.js');
  const { ensureSystemRoles } = await import('../src/systemRoles.js');
  await ensureSystemRoles(prisma);

  const pm = await prisma.user.create({
    data: {
      username: PM.username,
      passwordHash: await hashPassword(PM.password),
      name: 'Issue 103 PM',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
    },
  });
  pmUserId = pm.id;

  // Proje A (islemler) + Proje B (IDOR hedefi)
  pidA = (await prisma.project.create({ data: { name: 'Members A' } })).id;
  pidB = (await prisma.project.create({ data: { name: 'Members B' } })).id;

  const makeUser = async (creds, { roleKey, role }) => {
    return prisma.user.create({
      data: {
        username: creds.username,
        passwordHash: await hashPassword(creds.password),
        name: creds.username.replace(/-.*/, '').toUpperCase(),
        role: role || (roleKey === 'pm' ? 'Proje Yöneticisi' : 'System Engineer'),
        roleKey: roleKey || null,
      },
    });
  };

  const m = await makeUser(M, { roleKey: 'system_engineer', role: 'System Engineer' });
  mId = m.id;
  await prisma.projectMember.create({ data: { projectId: pidA, userId: mId } });

  const dep = await makeUser(DEP, { roleKey: 'system_engineer', role: 'System Engineer' });
  depId = dep.id;
  await prisma.projectMember.create({ data: { projectId: pidA, userId: depId } });

  const kept = await makeUser(KEPT, { roleKey: 'developer', role: 'Developer' });
  keptId = kept.id;
  await prisma.projectMember.create({ data: { projectId: pidA, userId: keptId } });

  const str = await makeUser(STRANGER, { roleKey: 'system_engineer', role: 'System Engineer' });
  strangerId = str.id;

  await makeUser(ADMIN, { roleKey: 'admin', role: 'Admin' });

  pmToken = (await login(PM)).accessToken;
  mToken = (await login(M)).accessToken;
  depToken = (await login(DEP)).accessToken;
  keptToken = (await login(KEPT)).accessToken;
  strangerToken = (await login(STRANGER)).accessToken;
  adminToken = (await login(ADMIN)).accessToken;
});

after(async () => {
  await prisma.$disconnect();
});

const asPm = (r) => r.set('Authorization', `Bearer ${pmToken}`);

// ============================================================================
//  Senaryo 1 — PM uye ekler, GET /members listeler (Karar #12 alanlari)
// ============================================================================
test('PM uye ekler -> GET /members liste (isim, rol adi, clearance, joinedAt)', async () => {
  const addStr = await asPm(request(app).post(`/api/projects/${pidA}/members`)).send({ userId: strangerId });
  assert.equal(addStr.status, 201, 'stranger uye olarak eklenmeli');
  assert.equal(addStr.body.alreadyMember, false);
  assert.equal(addStr.body.member.projectId, pidA);
  assert.equal(addStr.body.member.userId, strangerId);

  // MEMBER_ADD audit kaydi (proje-ceperli)
  const auditRow = await prisma.auditLog.findFirst({
    where: { projectId: pidA, action: 'MEMBER_ADD' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(auditRow, 'MEMBER_ADD audit kaydi olmali');

  const list = await asPm(request(app).get(`/api/projects/${pidA}/members`));
  assert.equal(list.status, 200);
  const row = list.body.find((x) => x.userId === strangerId);
  assert.ok(row, 'yeni uye listede olmali');
  assert.equal(row.username, STRANGER.username);
  assert.equal(row.roleKey, 'system_engineer');
  assert.equal(row.roleName, 'System Engineer');
  assert.equal(typeof row.clearanceLevel, 'number');
  assert.ok(row.joinedAt, 'joinedAt donmeli');
});

// ============================================================================
//  Senaryo 3 — PM-role kullanici eklenemez (Karar #7)
// ============================================================================
test('PM, PM-role kullaniciyi uye olarak ekleyemez -> 400 (Karar #7)', async () => {
  // PM2'yi yalnizca bu test icinde yarat: PM kullanicilari TUM projelerde
  // gerekli oy veren oldugu icin (Karar #9/4.3) havuzu kirletmemek adina
  // test sonunda silinir.
  const { hashPassword } = await import('../src/auth.js');
  const pm2 = await prisma.user.create({
    data: {
      username: PM2.username,
      passwordHash: await hashPassword(PM2.password),
      name: 'PM2',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
    },
  });
  pm2Id = pm2.id;
  const res = await asPm(request(app).post(`/api/projects/${pidA}/members`)).send({ userId: pm2Id });
  assert.equal(res.status, 400);
  assert.ok(/PM/i.test(res.body.error || ''), `PM reddi beklenir, gelen: ${res.body.error}`);
  await prisma.user.delete({ where: { id: pm2Id } });
});

// ============================================================================
//  Senaryo 4 — idempotent ekleme
// ============================================================================
test('Ayni kullaniciyi ikinci kez ekleme -> idempotent alreadyMember:true', async () => {
  const res = await asPm(request(app).post(`/api/projects/${pidA}/members`)).send({ userId: strangerId });
  assert.equal(res.status, 200, 'ikinci ekleme 200 (idempotent)');
  assert.equal(res.body.alreadyMember, true);
  assert.equal(res.body.member.userId, strangerId);
});

// ============================================================================
//  Senaryo 2 — members girisi yalnizca PM (Karar #6)
// ============================================================================
test('PM-olmayan kullanici (uye BILE) /members -> 403 (Karar #6)', async () => {
  const res = await request(app).get(`/api/projects/${pidA}/members`).set('Authorization', `Bearer ${mToken}`);
  assert.equal(res.status, 403);
});
// ============================================================================
//  Senaryo 5 — uyesi olmayan kullanici: proje varligini bile gormez
// ============================================================================
test('Uye olmayan kullanici: /requirements 403; /projects listesinde proje YOK', async () => {
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: 'ghost-issue103',
      passwordHash: await hashPassword('ghost-pass-103'),
      name: 'Ghost',
      role: 'System Engineer',
      roleKey: 'system_engineer',
    },
  });
  const g = await login({ username: 'ghost-issue103', password: 'ghost-pass-103' });

  const reqs = await request(app)
    .get(`/api/projects/${pidA}/requirements`)
    .set('Authorization', `Bearer ${g.accessToken}`);
  assert.equal(reqs.status, 403, 'uyesi olmayan projeye gereksinim istegi 403');

  const projs = await request(app).get('/api/projects').set('Authorization', `Bearer ${g.accessToken}`);
  assert.equal(projs.status, 200);
  const ids = projs.body.map((p) => p.id);
  assert.ok(!ids.includes(pidA), 'uyesi olmayan proje listede gorunmemeli');
  assert.ok(!ids.includes(pidB), 'hicbir proje gorunmemeli');
});

// ============================================================================
//  Senaryo 6 — uye cikarilinca ANINDA erisim kesilir (Karar #3)
// ============================================================================
test('Uye cikarilir -> ayni token ile aninda 403; proje listesinden duser', async () => {
  const del = await asPm(request(app).delete(`/api/projects/${pidA}/members/${depId}`));
  assert.equal(del.status, 200);
  assert.equal(del.body.ok, true);

  const auditRow = await prisma.auditLog.findFirst({
    where: { projectId: pidA, action: 'MEMBER_REMOVE' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(auditRow, 'MEMBER_REMOVE audit kaydi olmali');

  const reqs = await request(app).get(`/api/projects/${pidA}/requirements`).set('Authorization', `Bearer ${depToken}`);
  assert.equal(reqs.status, 403, 'cikarilan uye ayni token ile 403 alir');

  const projs = await request(app).get('/api/projects').set('Authorization', `Bearer ${depToken}`);
  const ids = projs.body.map((p) => p.id);
  assert.ok(!ids.includes(pidA), 'cikarilan uyenin listesinde proje olmamali');
});

// ============================================================================
//  Senaryo 8 — IDOR: cikarilan / uyesi olmayan B projesine de erisemez
// ============================================================================
test('IDOR — cikarilan/uyesi olmayan kullanici B projesine de erisemez', async () => {
  const res = await request(app).get(`/api/projects/${pidB}/requirements`).set('Authorization', `Bearer ${depToken}`);
  assert.equal(res.status, 403, 'dep: B projesine erisemez (uyelik yok)');

  const resStr = await request(app)
    .get(`/api/projects/${pidB}/requirements`)
    .set('Authorization', `Bearer ${strangerToken}`);
  assert.equal(resStr.status, 403, 'stranger B projesine erisemez');
});
// ============================================================================
//  Senaryo 7 — departed uye: onay kaydi durur, matrix departed, havuz daralir
//  Kurgu: pool = PM + M (M tek approve-iznli uye; stranger senaryo 1'de eklendi,
//  determinizm icin once cikarilir). Ikisi de oy verir -> Approved+locked.
//  M cikarilir: Approval kaydi KALIR; matrix departed:true gosterir; havuz
//  {PM}'e duser; PM kilidi acinca recompute yeni havuzla calisir ve cikarilan
//  uyenin oyu artik sayilmadigi icin "eksik oy -> Pending" olur (Karar #9).
// ============================================================================
test('Cikarilan uyenin Approval kaydi korunur, matrix departed, havuzdan duser -> Pending', async () => {
  // stranger senaryo 1'de uye yapildi; approve izinli oldugu icin havuzu kirletir.
  const delStr = await asPm(request(app).delete(`/api/projects/${pidA}/members/${strangerId}`));
  assert.equal(delStr.status, 200, 'belirleyici havuz icin stranger cikarilir');

  const req = await prisma.requirement.create({
    data: {
      projectId: pidA,
      text_id: 'REQ-103-001',
      title: 'Onay gecmisi denenmeli',
      type: 'System Requirement',
    },
  });

  // PM + M oy versin -> Approved + locked.
  const vPm = await asPm(request(app).post(`/api/projects/${pidA}/approvals/vote`)).send({
    entityType: 'requirement',
    entityId: req.id,
  });
  assert.equal(vPm.status, 200);
  const vM = await request(app)
    .post(`/api/projects/${pidA}/approvals/vote`)
    .set('Authorization', `Bearer ${mToken}`)
    .send({ entityType: 'requirement', entityId: req.id });
  assert.equal(vM.status, 200);

  const before = await prisma.requirement.findUnique({ where: { id: req.id } });
  assert.equal(before.approvalStatus, 'Approved');
  assert.equal(before.locked, true);

  // Aktif havuz (PM + M) dogrula — getRequiredVoters statik importu.
  const { getRequiredVoters } = await import('../src/cascade.js');
  const poolBefore = await getRequiredVoters(prisma, pidA, 'req-system');
  assert.equal(poolBefore.length, 2, 'havuz PM + M olmali');

  // M'yi cikar. Approval kaydi DOKUNULMAZ (gecmis).
  const del = await asPm(request(app).delete(`/api/projects/${pidA}/members/${mId}`));
  assert.equal(del.status, 200);

  const apprRow = await prisma.approval.findFirst({
    where: { projectId: pidA, entityType: 'requirement', entityId: req.id, voterId: mId },
  });
  assert.ok(apprRow, 'cikarilan uyenin Approval kaydi KORUNUR (gecmis)');

  // Havuz daraldi: sadece PM.
  const voters = await getRequiredVoters(prisma, pidA, 'req-system');
  assert.equal(voters.length, 1, 'havuz sadece PM olmali');
  assert.equal(voters[0].id, pmUserId);

  // Matrix: departed satiri (voted:true, departed:true).
  const matrix = await asPm(
    request(app).get(`/api/projects/${pidA}/approvals/matrix?entityType=requirement&entityId=${req.id}`),
  );
  assert.equal(matrix.status, 200);
  const depRow = matrix.body.voters.find((v) => v.voterId === mId && v.departed === true);
  assert.ok(depRow, 'matrix departed satiri olmali');
  assert.equal(depRow.voted, true);
  assert.equal(depRow.name, 'MEMBER');

  // Lazy: henuz recompute yok -> eski durum korunur (Approved).
  const still = await prisma.requirement.findUnique({ where: { id: req.id } });
  assert.equal(still.approvalStatus, 'Approved', 'lazy recompute: dokunulmayan kayit degismez');

  // PM kilidi acar -> oyu geri cekilir, recompute yeni havuzla calisir.
  // Cikarilan M'nin oyu artik gerekli oy veren sayilmadigi icin eksik oy -> Pending.
  const unlock = await asPm(request(app).post(`/api/projects/${pidA}/approvals/unlock`)).send({
    entityType: 'requirement',
    entityId: req.id,
  });
  assert.equal(unlock.status, 200);
  assert.equal(unlock.body.approvalStatus, 'Pending');
  assert.equal(unlock.body.locked, false);
  const afterUnlock = await prisma.requirement.findUnique({ where: { id: req.id } });
  assert.equal(afterUnlock.approvalStatus, 'Pending');
  assert.equal(afterUnlock.locked, false);
});
// ============================================================================
//  Senaryo 9 — POST/DELETE requirePM: aktif uye 403; ADMIN BILE 403 (Karar #2)
// ============================================================================
test('POST/DELETE /members requirePM: aktif uye 403, admin BILE 403 (Karar #2)', async () => {
  const keptPost = await request(app)
    .post(`/api/projects/${pidA}/members`)
    .set('Authorization', `Bearer ${keptToken}`)
    .send({ userId: strangerId });
  assert.equal(keptPost.status, 403, 'aktif uye uye ekleyemez');

  const keptDel = await request(app)
    .delete(`/api/projects/${pidA}/members/${strangerId}`)
    .set('Authorization', `Bearer ${keptToken}`);
  assert.equal(keptDel.status, 403, 'aktif uye uye cikaramaz');

  const adminPost = await request(app)
    .post(`/api/projects/${pidA}/members`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId: strangerId });
  assert.equal(adminPost.status, 403, 'ADMIN bile uye ekleyemez (Karar #2)');
});
