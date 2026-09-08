// ============================================================================
//  issue87-abac.test.js — Issue #87: ABAC (clearance level) erisim kontrolu.
//  Kapsam:
//    1) clearanceLevel=1 kullanici, seviye 2/3 gereksinimleri API'den
//       cekemez (liste bos / tek kayit 403) (AC #1).
//    2) clearanceLevel=3 kullanici tum gereksinimleri gorebilir (AC #2).
//    3) Seviye 3 klasor altina yeni gereksinim eklendiginde seviyesi otomatik 3 olur (AC #3).
//    4) Tasima sonrasi yeni usten seviye miras alinir.
//    5) Filtre Prisma WHERE'de yapilir (listelemede sadece gorunur seviyeler doner).
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
// Ortak env + DB reset yardimcisi (tek dogruluk kaynagi: tests/_setup.js).
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM = { username: 'pm-abac', password: 'pm-pass-1234' };
const L1 = { username: 'l1-abac', password: 'l1-pass-1234' };
const L3 = { username: 'l3-abac', password: 'l3-pass-1234' };

let pid;
let pmToken;
let l1Token;
let l3Token;
let reqL1;
let reqL3;
let folderL3;

async function login(creds) {
  const res = await request(app).post('/api/auth/login').send(creds);
  assert.equal(res.status, 200, `login (${creds.username}) -> 200`);
  return res.body.accessToken;
}

async function createReq(token, body) {
  const res = await request(app)
    .post(`/api/projects/${pid}/requirements`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res;
}

before(async () => {
  resetDb();
  const { hashPassword } = await import('../src/auth.js');
  const proj = await prisma.project.create({ data: { name: 'ABAC Proje' } });
  pid = proj.id;
  // PM: projeye atanmadan tum projelere erisir (isPM).
  await prisma.user.create({
    data: {
      username: PM.username,
      passwordHash: await hashPassword(PM.password),
      name: 'PM',
      role: 'Proje Yoneticisi',
      systemRole: 'USER',
      clearanceLevel: 5,
      isActive: true,
    },
  });
  // L1 / L3: normal kullanici, atanmis proje (projectId) ile erisir.
  await prisma.user.create({
    data: {
      username: L1.username,
      passwordHash: await hashPassword(L1.password),
      name: 'L1',
      role: 'System Engineer',
      systemRole: 'USER',
      clearanceLevel: 1,
      projectId: pid,
      isActive: true,
    },
  });
  await prisma.user.create({
    data: {
      username: L3.username,
      passwordHash: await hashPassword(L3.password),
      name: 'L3',
      role: 'System Engineer',
      systemRole: 'USER',
      clearanceLevel: 3,
      projectId: pid,
      isActive: true,
    },
  });

  pmToken = await login(PM);
  l1Token = await login(L1);
  l3Token = await login(L3);
});

after(async () => {
  await prisma.$disconnect();
});

// --- Kurulum: PM (seviye 5) gereksinimleri olusturur ------------------------
test('PM — farkli seviyelerde gereksinimler olusturabilir', async () => {
  const r1 = await createReq(pmToken, { type: 'System Requirement', title: 'R1 dusuk', clearanceLevel: 1 });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.clearanceLevel, 1);
  reqL1 = r1.body.id;

  const r3 = await createReq(pmToken, { type: 'System Requirement', title: 'R3 gizli', clearanceLevel: 3 });
  assert.equal(r3.status, 201);
  assert.equal(r3.body.clearanceLevel, 3);
  reqL3 = r3.body.id;

  const f3 = await createReq(pmToken, { type: 'User Requirement', title: 'Klasor 3', clearanceLevel: 3 });
  assert.equal(f3.status, 201);
  assert.equal(f3.body.clearanceLevel, 3);
  folderL3 = f3.body.id;
});

// --- AC #1: seviye 1, seviye 3'u goremez -------------------------------------
test('AC#1 — clearanceLevel=1 kullanici seviye 3 gereksinimi goremez', async () => {
  const list = await request(app).get(`/api/projects/${pid}/requirements`).set('Authorization', `Bearer ${l1Token}`);
  assert.equal(list.status, 200);
  const ids = list.body.map((r) => r.id);
  assert.ok(ids.includes(reqL1), 'seviye 1 gereksinim gorulmeli');
  assert.ok(!ids.includes(reqL3), 'seviye 3 gereksinim gorulmemeli');
  assert.ok(!ids.includes(folderL3), 'seviye 3 klasor gorulmemeli');

  const single = await request(app)
    .get(`/api/projects/${pid}/requirements/${reqL3}`)
    .set('Authorization', `Bearer ${l1Token}`);
  assert.equal(single.status, 403, 'seviye 3 tek kayit 403 donmeli');

  const tree = await request(app)
    .get(`/api/projects/${pid}/requirements/tree`)
    .set('Authorization', `Bearer ${l1Token}`);
  assert.equal(tree.status, 200);
  const treeIds = tree.body.items.map((r) => r.id);
  assert.ok(treeIds.includes(reqL1));
  assert.ok(!treeIds.includes(reqL3));
  assert.ok(!treeIds.includes(folderL3));
});

// --- AC #2: seviye 3, her seyi gorur ----------------------------------------
test('AC#2 — clearanceLevel=3 kullanici tum gereksinimleri gorebilir', async () => {
  const list = await request(app).get(`/api/projects/${pid}/requirements`).set('Authorization', `Bearer ${l3Token}`);
  assert.equal(list.status, 200);
  const ids = list.body.map((r) => r.id);
  assert.ok(ids.includes(reqL1));
  assert.ok(ids.includes(reqL3));
  assert.ok(ids.includes(folderL3));

  const single = await request(app)
    .get(`/api/projects/${pid}/requirements/${reqL3}`)
    .set('Authorization', `Bearer ${l3Token}`);
  assert.equal(single.status, 200);
  assert.equal(single.body.clearanceLevel, 3);
});

// --- AC #3: seviye 3 klasor altinda olusturulan gerek. seviyesi 3 olur ------
test('AC#3 — seviye 3 klasor altina eklenen gereksinim usten seviyeyi miras alir', async () => {
  const child = await createReq(l3Token, {
    type: 'System Requirement',
    title: 'R3 alti cocuk',
    parentId: folderL3,
  });
  assert.equal(child.status, 201, 'seviye 3 kullanici klasor altina ekleyebilmeli');
  assert.equal(child.body.clearanceLevel, 3, 'cocuk usten seviyeyi miras almalidir');
});

// --- Tasima: yeni usten seviye miras -----------------------------------------
test('tasima — seviye 3 klasor altina tasinan gerek. seviye 3 olur', async () => {
  const moved = await request(app)
    .patch(`/api/projects/${pid}/requirements/${reqL1}/move`)
    .set('Authorization', `Bearer ${l3Token}`)
    .send({ parentId: folderL3 });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.clearanceLevel, 3, 'tasinan gereksinim yeni usten seviyeyi miras almalidir');
});

// --- Yazma guard: seviye 1, seviye 3 olusturamaz ----------------------------
test('yazma — seviye 1 kullanici seviye 3 gereksinim olusturamaz', async () => {
  const r = await createReq(l1Token, { type: 'System Requirement', title: 'Hata', clearanceLevel: 3 });
  assert.equal(r.status, 403, 'kendi seviyesinden yuksek gereksinim olusturulmamali');
});
