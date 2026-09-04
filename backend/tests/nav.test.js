// ============================================================================
//  nav.test.js — Sol menu duzeni (gruplar + sayfa yerlesimi). Issue #9 / Adim 6.
//  Kapsam: yerlesik varsayilan duzen, ilk ozellestirmede materialize,
//  grup silinince sayfalarin KAYBOLMAMASI, gecersiz pageKey reddi,
//  PM olmayan kullanicinin mutasyon yapamamasi (403), IDOR korumasi.
// ============================================================================
// Ortak test setup'i (Issue #69): env degiskenleri + resetDb.
// PrismaClient import'undan ONCE yuklenmeli.
import { resetDb } from './_setup.js';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

let proj;
let otherProj;
let pmToken;
let personnelToken;

before(async () => {
  resetDb();

  const { hashPassword, signToken } = await import('../src/auth.js');
  const user = await prisma.user.create({
    data: { username: 'pm-nav', password: await hashPassword('pm-pass'), name: 'Nav PM', role: 'Proje Yoneticisi' },
  });
  pmToken = signToken({ kind: 'pm', isPM: true, userId: user.id });

  proj = await prisma.project.create({ data: { name: 'Nav Proje', description: 'Test' } });
  otherProj = await prisma.project.create({ data: { name: 'Nav Baska Proje', description: 'Test' } });

  // Personel: yalnizca `proj`e atanmis (PM degil).
  const role = await prisma.role.create({ data: { projectId: proj.id, name: 'Muhendis', permissions: {} } });
  const person = await prisma.personnel.create({
    data: { projectId: proj.id, roleId: role.id, firstName: 'A', lastName: 'B', passcode: 'NAV-1' },
  });
  personnelToken = signToken({ kind: 'personnel', isPM: false, projectId: proj.id, personnelId: person.id });
});

beforeEach(async () => {
  // Her testten once menu ozellestirmelerini temizle (varsayilana don).
  await prisma.navItem.deleteMany({});
  await prisma.navGroup.deleteMany({});
});

after(async () => {
  await prisma.$disconnect();
});

const asPM = (r) => r.set('Authorization', `Bearer ${pmToken}`);

// --- Varsayilan duzen ---------------------------------------------------------

test('GET /nav — ozellestirme yoksa yerlesik varsayilan duzen doner', async () => {
  const res = await asPM(request(app).get(`/api/projects/${proj.id}/nav`));
  assert.equal(res.status, 200);
  assert.equal(res.body.materialized, false);
  // "Gereksinimler" grubu varsayilandan cikarildi: gereksinim sayfalari artik
  // ust menudeki birlesik "Gereksinimler" (PBS agaci) sayfasinda.
  assert.equal(res.body.groups.length, 1);
  assert.deepEqual(
    res.body.groups.map((g) => g.nameKey),
    ['nav.groupTests'],
  );
  assert.deepEqual(
    res.body.groups[0].items.map((i) => i.pageKey),
    ['test-acceptance', 'test-system', 'test-subsystem'],
  );
  // Sozluk bagimsiz (grupsuz).
  assert.deepEqual(
    res.body.ungrouped.map((i) => i.pageKey),
    ['glossary'],
  );
});

test('GET /nav — varsayilan duzen DB YAZMADAN doner (yan etkisiz)', async () => {
  await asPM(request(app).get(`/api/projects/${proj.id}/nav`));
  assert.equal(await prisma.navGroup.count({ where: { projectId: proj.id } }), 0);
  assert.equal(await prisma.navItem.count({ where: { projectId: proj.id } }), 0);
});

// --- Materialize + grup ekleme -------------------------------------------------

test('POST /nav/groups — ilk ozellestirmede varsayilan duzen materialize edilir', async () => {
  const res = await asPM(request(app).post(`/api/projects/${proj.id}/nav/groups`)).send({ name: 'Ozel Grup' });
  assert.equal(res.status, 201);

  const layout = await asPM(request(app).get(`/api/projects/${proj.id}/nav`));
  assert.equal(layout.body.materialized, true);
  // 1 varsayilan (Testler) + 1 yeni grup
  assert.equal(layout.body.groups.length, 2);
  const names = layout.body.groups.map((g) => g.name);
  assert.ok(names.includes('Testler') && names.includes('Ozel Grup'));
  // Sayfalar korunmus olmali (3 gruplu + 1 grupsuz = 4)
  assert.equal(await prisma.navItem.count({ where: { projectId: proj.id } }), 4);
});

test('POST /nav/groups — ayni adda ikinci grup 409 doner', async () => {
  await asPM(request(app).post(`/api/projects/${proj.id}/nav/groups`)).send({ name: 'Tekrar' });
  const res = await asPM(request(app).post(`/api/projects/${proj.id}/nav/groups`)).send({ name: 'Tekrar' });
  assert.equal(res.status, 409);
});

test('POST /nav/groups — bos isim 400 doner', async () => {
  const res = await asPM(request(app).post(`/api/projects/${proj.id}/nav/groups`)).send({ name: '   ' });
  assert.equal(res.status, 400);
});

// --- Oge tasima / sayfa ekleme -------------------------------------------------

// Bu testler gercek item id'lerine ihtiyac duyar; yerlesik varsayilan
// (materialize edilmemis) duzende id yoktur. O yuzden once materialize edilir.
async function layout() {
  await asPM(request(app).post(`/api/projects/${proj.id}/nav/materialize`));
  const res = await asPM(request(app).get(`/api/projects/${proj.id}/nav`));
  return res.body;
}
const findItem = (lay, pageKey) =>
  [...lay.groups.flatMap((g) => g.items), ...lay.ungrouped].find((i) => i.pageKey === pageKey);

test('PATCH /nav/items/:id — sayfa baska gruba tasinir', async () => {
  const created = await asPM(request(app).post(`/api/projects/${proj.id}/nav/groups`)).send({ name: 'Hedef' });
  const item = findItem(await layout(), 'test-acceptance');
  const res = await asPM(request(app).patch(`/api/projects/${proj.id}/nav/items/${item.id}`)).send({
    groupId: created.body.id,
    order: 0,
  });
  assert.equal(res.status, 200);

  const hedef = (await layout()).groups.find((g) => g.name === 'Hedef');
  assert.deepEqual(
    hedef.items.map((i) => i.pageKey),
    ['test-acceptance'],
  );
});

test('PATCH /nav/items/:id — groupId null ise grupsuz seviyeye tasir', async () => {
  const item = findItem(await layout(), 'test-system');
  const res = await asPM(request(app).patch(`/api/projects/${proj.id}/nav/items/${item.id}`)).send({
    groupId: null,
  });
  assert.equal(res.status, 200);
  assert.ok((await layout()).ungrouped.some((i) => i.pageKey === 'test-system'));
});

test('POST /nav/items — gruba YENI sayfa eklenir, sayfa sayisi artar', async () => {
  const before = (await layout()).groups.find((g) => g.name === 'Testler');
  assert.equal(before.items.length, 3);

  const res = await asPM(request(app).post(`/api/projects/${proj.id}/nav/items`)).send({
    groupId: before.id,
    pageKey: 'req-subsystem',
    label: 'Haberlesme Gereksinimleri',
    fieldFilter: 'Haberlesme',
  });
  assert.equal(res.status, 201);

  const after = (await layout()).groups.find((g) => g.name === 'Testler');
  assert.equal(after.items.length, 4); // 3 -> 4
  const yeni = after.items.find((i) => i.label === 'Haberlesme Gereksinimleri');
  assert.equal(yeni.pageKey, 'req-subsystem');
  assert.equal(yeni.fieldFilter, 'Haberlesme');
});

test('POST /nav/items — AYNI tipten birden fazla sayfa eklenebilir', async () => {
  const g = (await layout()).groups.find((x) => x.name === 'Testler');
  await asPM(request(app).post(`/api/projects/${proj.id}/nav/items`)).send({
    groupId: g.id,
    pageKey: 'req-user',
    label: 'Musteri Gereksinimleri',
  });
  await asPM(request(app).post(`/api/projects/${proj.id}/nav/items`)).send({
    groupId: g.id,
    pageKey: 'req-user',
    label: 'Operator Gereksinimleri',
  });
  const after = (await layout()).groups.find((x) => x.name === 'Testler');
  assert.equal(after.items.length, 5); // 3 + 2
  assert.equal(after.items.filter((i) => i.pageKey === 'req-user').length, 2); // 2 yeni ozel sayfa
});

test('POST /nav/items — UYDURMA sayfa tipi 400 doner (tipler sabit)', async () => {
  const g = (await layout()).groups.find((x) => x.name === 'Testler');
  const res = await asPM(request(app).post(`/api/projects/${proj.id}/nav/items`)).send({
    groupId: g.id,
    pageKey: 'uydurma-tip',
    label: 'Olmaz',
  });
  assert.equal(res.status, 400);
});

test('DELETE /nav/items/:id — sayfa menuden kaldirilir, VERILER silinmez', async () => {
  const g = (await layout()).groups.find((x) => x.name === 'Testler');
  const created = await asPM(request(app).post(`/api/projects/${proj.id}/nav/items`)).send({
    groupId: g.id,
    pageKey: 'req-user',
    label: 'Gecici Sayfa',
  });
  const reqCountBefore = await prisma.requirement.count({ where: { projectId: proj.id } });

  const res = await asPM(request(app).delete(`/api/projects/${proj.id}/nav/items/${created.body.id}`));
  assert.equal(res.status, 200);

  const after = (await layout()).groups.find((x) => x.name === 'Testler');
  assert.ok(!after.items.some((i) => i.label === 'Gecici Sayfa'));
  assert.equal(await prisma.requirement.count({ where: { projectId: proj.id } }), reqCountBefore);
});

test('PATCH /nav/items/:id — ozel ad ve Alan filtresi guncellenebilir', async () => {
  const item = findItem(await layout(), 'glossary');
  const res = await asPM(request(app).patch(`/api/projects/${proj.id}/nav/items/${item.id}`)).send({
    label: 'Terimler',
  });
  assert.equal(res.status, 200);
  assert.equal(findItem(await layout(), 'glossary').label, 'Terimler');
});

// --- Grup silme ----------------------------------------------------------------

test('DELETE /nav/groups/:id — grup silinince sayfalar KAYBOLMAZ, grupsuza duser', async () => {
  await asPM(request(app).post(`/api/projects/${proj.id}/nav/groups`)).send({ name: 'Gecici' });
  const layout = await asPM(request(app).get(`/api/projects/${proj.id}/nav`));
  const reqGroup = layout.body.groups.find((g) => g.name === 'Testler');

  const res = await asPM(request(app).delete(`/api/projects/${proj.id}/nav/groups/${reqGroup.id}`));
  assert.equal(res.status, 200);
  assert.equal(res.body.movedToUngrouped, 3);

  const after = await asPM(request(app).get(`/api/projects/${proj.id}/nav`));
  const ungroupedKeys = after.body.ungrouped.map((i) => i.pageKey);
  for (const key of ['test-acceptance', 'test-system', 'test-subsystem']) {
    assert.ok(ungroupedKeys.includes(key), `${key} kaybolmamali`);
  }
  // Hicbir sayfa kaybolmadi: toplam hala 4
  assert.equal(await prisma.navItem.count({ where: { projectId: proj.id } }), 4);
});

// --- Yetki + IDOR ---------------------------------------------------------------

test('PM olmayan kullanici menuyu DEGISTIREMEZ (403) ama OKUYABILIR', async () => {
  const read = await request(app).get(`/api/projects/${proj.id}/nav`).set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(read.status, 200);

  const write = await request(app)
    .post(`/api/projects/${proj.id}/nav/groups`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ name: 'Olmaz' });
  assert.equal(write.status, 403);
});

test('IDOR — personel baska projenin menusune erisemez', async () => {
  const res = await request(app)
    .get(`/api/projects/${otherProj.id}/nav`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 403);
});
