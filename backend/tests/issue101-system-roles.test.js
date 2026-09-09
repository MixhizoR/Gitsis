// ============================================================================
//  issue101-system-roles.test.js — Issue #101: Sistem rolleri + izin yonetimi.
//  Kapsam:
//    1) Startup seed: 4 cekirdek sistem rolu (pm/se/dev/admin) olusur.
//    2) USER admin API'lerinde 403 alir.
//    3) Rol listesi + izin guncelleme (12 kademeli JSON).
//    4) Sistem rolu silinemez; ozel rol olusturulur ve silinir.
//    5) Kullaniciya roleKey atama (create + patch); display rol adi turetilir.
//    6) PM tespit regresyonu: roleKey='pm' ile login isPM=true doner.
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const { ensureSystemRoles } = await import('../src/systemRoles.js');

const prisma = new PrismaClient();

const ADMIN = { username: 'admin-101', password: 'admin-pass-101' };
const USER = { username: 'user-101', password: 'user-pass-101' };

let adminToken;
let userToken;

async function login(creds) {
  return request(app).post('/api/auth/login').send(creds);
}

before(async () => {
  resetDb();
  // Test ortaminda listen yok; rolleri burada garanti ederiz.
  await ensureSystemRoles(prisma);
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      passwordHash: await hashPassword(ADMIN.password),
      name: 'Admin',
      role: 'System Engineer',
      roleKey: 'system_engineer',
      systemRole: 'ADMIN',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  await prisma.user.create({
    data: {
      username: USER.username,
      passwordHash: await hashPassword(USER.password),
      name: 'User',
      role: 'Developer',
      roleKey: 'developer',
      systemRole: 'USER',
      clearanceLevel: 1,
      isActive: true,
    },
  });
  adminToken = (await login(ADMIN)).body.accessToken;
  userToken = (await login(USER)).body.accessToken;
});

after(async () => {
  await prisma.$disconnect();
});

// --- 1) Cekirdek roller seed edilmis olmali ----------------------------------
test('cekirdek sistem rolleri (pm/se/dev/admin) seed edilmis', async () => {
  const keys = (await prisma.systemRole.findMany()).map((r) => r.key).sort();
  assert.deepEqual(keys, ['admin', 'developer', 'pm', 'system_engineer']);
  const pm = await prisma.systemRole.findUnique({ where: { key: 'pm' } });
  assert.equal(pm.isSystem, true);
  assert.equal(pm.name, 'Proje Yöneticisi');
  // 12 kademeli matrisin tamami acik olmali (PM varsayilani).
  assert.equal(pm.permissions.approve.enabled, true);
  assert.equal(pm.permissions.manage_roles.enabled, true);
});

// --- 2) USER admin uclarinda 403 ---------------------------------------------
test('USER sistem rol APIlerinde 403 alir', async () => {
  const r = await request(app).get('/api/admin/system-roles').set('Authorization', `Bearer ${userToken}`);
  assert.equal(r.status, 403);
});

// --- 3) Liste + izin guncelleme ----------------------------------------------
test('admin rolleri listeler ve izinleri gunceller', async () => {
  const list = await request(app).get('/api/admin/system-roles').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.length >= 4);

  const dev = list.body.find((r) => r.key === 'developer');
  const perms = JSON.parse(JSON.stringify(dev.permissions));
  perms.add_test = { enabled: true, components: ['test-acceptance'] };

  const upd = await request(app)
    .patch('/api/admin/system-roles/developer')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ permissions: perms });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.permissions.add_test.enabled, true);

  const after = await prisma.systemRole.findUnique({ where: { key: 'developer' } });
  assert.equal(after.permissions.add_test.components[0], 'test-acceptance');
});

// --- 4) Sistem rolu silinemez; ozel rol olusturulur ve silinir ----------------
test('sistem rolu silinemez; ozel rol olusturulup silinebilir', async () => {
  const del = await request(app).delete('/api/admin/system-roles/pm').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(del.status, 400, 'sistem rolu silinemez');

  const create = await request(app)
    .post('/api/admin/system-roles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ key: 'qa_engineer', name: 'QA Muhendisi' });
  assert.equal(create.status, 201);
  assert.equal(create.body.isSystem, false);

  const del2 = await request(app)
    .delete('/api/admin/system-roles/qa_engineer')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(del2.status, 204);
});

// --- 5) Kullaniciya roleKey atama --------------------------------------------
test('kullanici olusturulurken roleKey verilir; display rol adi turetilir', async () => {
  const create = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({
    username: 'rolkey-101',
    password: 'rolkey-pass-1',
    name: 'Rol Key',
    roleKey: 'system_engineer',
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.roleKey, 'system_engineer');
  assert.equal(create.body.role, 'System Engineer', 'display ad SystemRole.name olmali');

  // PATCH ile PM'ye cevir: display ad 'Proje Yöneticisi' olmali.
  const patch = await request(app)
    .patch(`/api/admin/users/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ roleKey: 'pm' });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.roleKey, 'pm');
  assert.equal(patch.body.role, 'Proje Yöneticisi');

  // Gecersiz roleKey reddedilir.
  const bad = await request(app)
    .patch(`/api/admin/users/${create.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ roleKey: 'yok-boyle-rol' });
  assert.equal(bad.status, 400);
});

// --- 6) PM tespit regresyonu -------------------------------------------------
test("roleKey='pm' ile login isPM=true doner", async () => {
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: 'pm-101',
      passwordHash: await hashPassword('pm-pass-101'),
      name: 'PM 101',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
      systemRole: 'USER',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  const lg = await login({ username: 'pm-101', password: 'pm-pass-101' });
  assert.equal(lg.status, 200);
  assert.equal(lg.body.user.roleKey, 'pm');

  // Eski tarz (roleKey null, role = 'Proje Yöneticisi') da calismali.
  await prisma.user.create({
    data: {
      username: 'pm-legacy-101',
      passwordHash: await hashPassword('legacy-pass-1'),
      name: 'PM Legacy',
      role: 'Proje Yöneticisi',
      systemRole: 'USER',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  const lg2 = await login({ username: 'pm-legacy-101', password: 'legacy-pass-1' });
  assert.equal(lg2.status, 200);
  const jwtMod = await import('jsonwebtoken');
  const payload = jwtMod.default.verify(lg2.body.accessToken, process.env.JWT_SECRET || 'ehsim-test-secret');
  assert.equal(payload.isPM, true, 'eski veri PM tespiti bozulmamali');
});
