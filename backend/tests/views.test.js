// ============================================================================
//  views.test.js — Kayitli Gorunumler (Saved Views, Issue #105).
//
//  Kapsam:
//    - CRUD: olusturma / guncelleme / silme / varsayilan yapma
//    - KALICILIK: kaydedilen gorunum (filtre + sutun + satir duzeni) yeni bir
//      oturumda (yeni token) AYNEN geri okunur — kabul kriteri
//    - Kullanici bazli izolasyon: baskasinin kisisel gorunumu ne listede
//      gorunur ne de degistirilebilir (403)
//    - Paylasim modeli: scope='project' gorunumu yalnizca PM olusturur ama
//      projedeki herkes gorur (ileriye donuk modelleme)
//    - Varsayilan tekilligi: ayni sahip+sayfa icinde tek isDefault
//    - Dogrulama: gecersiz sayfa boyutu/siralama guvenli varsayilana duser,
//      ayni isim 409, IDOR (baska projenin gorunumu) 404
// ============================================================================
import { resetDb } from './_setup.js';
import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import request from 'supertest';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

let proj;
let otherProj;
let pmToken;
let memberToken;
let otherMemberToken;

const FILTERS = {
  q: 'motor',
  type: 'User Requirement',
  field: 'HMI',
  status: 'In Review',
  assignee: '',
  attrs: { priority: 'High' },
};
const COLUMNS = [
  { key: 'code', visible: true },
  { key: 'title', visible: true },
  { key: 'status', visible: true },
  { key: 'field', visible: false },
  { key: 'links', visible: false },
  { key: 'actions', visible: true },
];
const ROW_LAYOUT = { pageSize: 50, sortBy: 'title', sortDir: 'desc' };

const body = (over = {}) => ({
  navKey: 'req-user',
  name: 'Acik HMI gereksinimleri',
  filters: FILTERS,
  columns: COLUMNS,
  rowLayout: ROW_LAYOUT,
  ...over,
});

const create = (token, over = {}, pid = proj.id) =>
  request(app).post(`/api/projects/${pid}/views`).set('Authorization', `Bearer ${token}`).send(body(over));

const list = (token, navKey, pid = proj.id) =>
  request(app)
    .get(`/api/projects/${pid}/views${navKey ? `?navKey=${navKey}` : ''}`)
    .set('Authorization', `Bearer ${token}`);

before(async () => {
  resetDb();

  const { hashPassword, signToken } = await import('../src/auth.js');
  const pm = await prisma.user.create({
    data: {
      username: 'pm-views',
      passwordHash: await hashPassword('pm-pass'),
      name: 'Views PM',
      role: 'Proje Yöneticisi',
      roleKey: 'pm',
    },
  });
  pmToken = signToken({ userId: pm.id, roleKey: 'pm' });

  proj = await prisma.project.create({ data: { name: 'Gorunum Proje', description: 'Test' } });
  otherProj = await prisma.project.create({ data: { name: 'Baska Proje', description: 'Test' } });

  const member = await prisma.user.create({
    data: {
      username: 'member-views',
      passwordHash: await hashPassword('member-pass'),
      name: 'Uye Bir',
      role: 'System Engineer',
      roleKey: 'system_engineer',
    },
  });
  const other = await prisma.user.create({
    data: {
      username: 'member2-views',
      passwordHash: await hashPassword('member-pass'),
      name: 'Uye Iki',
      role: 'System Engineer',
      roleKey: 'system_engineer',
    },
  });
  await prisma.projectMember.create({ data: { projectId: proj.id, userId: member.id } });
  await prisma.projectMember.create({ data: { projectId: proj.id, userId: other.id } });
  memberToken = signToken({ userId: member.id, roleKey: 'system_engineer' });
  otherMemberToken = signToken({ userId: other.id, roleKey: 'system_engineer' });
});

beforeEach(async () => {
  await prisma.savedView.deleteMany({});
});

test('gorunum olusturur ve filtre + sutun + satir duzenini AYNEN saklar', async () => {
  const res = await create(memberToken);
  assert.equal(res.status, 201);
  assert.equal(res.body.navKey, 'req-user');
  assert.equal(res.body.scope, 'user');
  assert.deepEqual(res.body.filters, FILTERS);
  assert.deepEqual(res.body.columns, COLUMNS);
  assert.deepEqual(res.body.rowLayout, ROW_LAYOUT);
});

test('KALICILIK: yeni bir oturumda ayni gorunum aynen geri okunur', async () => {
  const created = await create(memberToken, { isDefault: true });
  assert.equal(created.status, 201);

  // "Oturumu kapat / yeniden ac": ayni kullanici icin YENI bir token.
  const { signToken } = await import('../src/auth.js');
  const freshToken = signToken({ userId: created.body.userId, roleKey: 'system_engineer' });

  const res = await list(freshToken, 'req-user');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].isDefault, true);
  assert.deepEqual(res.body[0].filters, FILTERS);
  assert.deepEqual(res.body[0].columns, COLUMNS);
  assert.deepEqual(res.body[0].rowLayout, ROW_LAYOUT);
});

test('gorunum guncellenir (filtre + sutun + satir duzeni birlikte)', async () => {
  const created = await create(memberToken);
  const res = await request(app)
    .patch(`/api/projects/${proj.id}/views/${created.body.id}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({
      name: 'Yeni ad',
      filters: { ...FILTERS, q: 'fren' },
      columns: [...COLUMNS.slice(0, 3)],
      rowLayout: { pageSize: 10, sortBy: 'text_id', sortDir: 'asc' },
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Yeni ad');
  assert.equal(res.body.filters.q, 'fren');
  assert.equal(res.body.columns.length, 3);
  assert.deepEqual(res.body.rowLayout, { pageSize: 10, sortBy: 'text_id', sortDir: 'asc' });
});

test('gorunum silinir', async () => {
  const created = await create(memberToken);
  const del = await request(app)
    .delete(`/api/projects/${proj.id}/views/${created.body.id}`)
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(del.status, 200);
  const res = await list(memberToken, 'req-user');
  assert.equal(res.body.length, 0);
});

test('varsayilan TEKTIR: yeni varsayilan eskisini temizler', async () => {
  const a = await create(memberToken, { name: 'A', isDefault: true });
  const b = await create(memberToken, { name: 'B' });
  const res = await request(app)
    .post(`/api/projects/${proj.id}/views/${b.body.id}/default`)
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.isDefault, true);

  const after = await list(memberToken, 'req-user');
  const byId = Object.fromEntries(after.body.map((v) => [v.id, v.isDefault]));
  assert.equal(byId[a.body.id], false);
  assert.equal(byId[b.body.id], true);
});

test('varsayilan sayfa bazlidir: baska navKey etkilenmez', async () => {
  const a = await create(memberToken, { name: 'A', isDefault: true });
  await create(memberToken, { navKey: 'test-acceptance', name: 'B', isDefault: true });
  const res = await list(memberToken);
  const kept = res.body.find((v) => v.id === a.body.id);
  assert.equal(kept.isDefault, true);
});

test('kisisel gorunum baskasina GORUNMEZ ve degistirilemez', async () => {
  const mine = await create(memberToken, { name: 'Bana ozel' });
  const theirs = await list(otherMemberToken, 'req-user');
  assert.equal(theirs.body.length, 0);

  const patch = await request(app)
    .patch(`/api/projects/${proj.id}/views/${mine.body.id}`)
    .set('Authorization', `Bearer ${otherMemberToken}`)
    .send({ name: 'Calindi' });
  assert.equal(patch.status, 403);

  const del = await request(app)
    .delete(`/api/projects/${proj.id}/views/${mine.body.id}`)
    .set('Authorization', `Bearer ${otherMemberToken}`);
  assert.equal(del.status, 403);
});

test('proje geneli (paylasilan) gorunumu yalnizca PM olusturur; herkes gorur', async () => {
  const denied = await create(memberToken, { name: 'Paylasilan', scope: 'project' });
  assert.equal(denied.status, 403);

  const shared = await create(pmToken, { name: 'Paylasilan', scope: 'project' });
  assert.equal(shared.status, 201);
  assert.equal(shared.body.userId, null);

  for (const token of [memberToken, otherMemberToken]) {
    const res = await list(token, 'req-user');
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].scope, 'project');
  }
  // Paylasilan gorunumu normal uye degistiremez.
  const patch = await request(app)
    .patch(`/api/projects/${proj.id}/views/${shared.body.id}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ name: 'Degistim' });
  assert.equal(patch.status, 403);
});

test('ayni sahip + sayfa icinde ayni isim reddedilir (409)', async () => {
  await create(memberToken, { name: 'Tekrar' });
  const dup = await create(memberToken, { name: 'Tekrar' });
  assert.equal(dup.status, 409);
  // Baska kullanici ayni ismi kullanabilir.
  const other = await create(otherMemberToken, { name: 'Tekrar' });
  assert.equal(other.status, 201);
});

test('gecersiz satir duzeni ve sutun girdisi guvenli varsayilana duser', async () => {
  const res = await create(memberToken, {
    name: 'Bozuk',
    rowLayout: { pageSize: 7, sortBy: 'DROP TABLE', sortDir: 'yukari' },
    columns: [{ key: 'code', visible: true }, { key: 'code', visible: false }, { key: '' }],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.rowLayout, { pageSize: 25, sortBy: 'text_id', sortDir: 'asc' });
  // Tekrarlanan anahtar bir kez, bos anahtar hic yazilmaz.
  assert.deepEqual(res.body.columns, [{ key: 'code', visible: true }]);
});

test('oznitelik sutununa gore siralama kabul edilir', async () => {
  const res = await create(memberToken, {
    name: 'Oznitelik sirali',
    rowLayout: { pageSize: 100, sortBy: 'attr:priority', sortDir: 'desc' },
  });
  assert.equal(res.body.rowLayout.sortBy, 'attr:priority');
});

test('isimsiz gorunum reddedilir (400)', async () => {
  const res = await create(memberToken, { name: '   ' });
  assert.equal(res.status, 400);
});

test('IDOR: baska projenin gorunumu bu proje altinda bulunamaz (404)', async () => {
  const mine = await create(pmToken, { name: 'Baska projede' }, otherProj.id);
  assert.equal(mine.status, 201);
  const res = await request(app)
    .patch(`/api/projects/${proj.id}/views/${mine.body.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ name: 'Sizdi' });
  assert.equal(res.status, 404);
});

test('IDOR: uye olmadigi projenin gorunumlerini listeleyemez (403)', async () => {
  const res = await list(memberToken, 'req-user', otherProj.id);
  assert.equal(res.status, 403);
});

test('proje silinince gorunumler de silinir (cascade)', async () => {
  const temp = await prisma.project.create({ data: { name: 'Gecici', description: '' } });
  await create(pmToken, { name: 'Gecici gorunum' }, temp.id);
  await prisma.project.delete({ where: { id: temp.id } });
  const rows = await prisma.savedView.findMany({ where: { projectId: temp.id } });
  assert.equal(rows.length, 0);
});
