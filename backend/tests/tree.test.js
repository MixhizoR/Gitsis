// ============================================================================
//  tree.test.js — PBS agaci backend regresyon testleri (Issue #9 / Adim 2).
//  Lazy-load cocuk sorgusu (getTreeChildren) + Recursive CTE ust-zincir
//  (getTreeAncestorPath), SQL injection guard, /requirements/tree ve
//  /requirements/:id/ancestors endpoint'leri.
// ============================================================================
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ci-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(process.env.POSTGRES_PASSWORD || 'ehsim_pass')}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

let proj;
let userReq; // kok (parentId null)
let sysReq; // userReq'in cocugu
let swLeaf; // sysReq'in cocugu, yapraq
let pmToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      /* already exists */
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', { stdio: 'inherit', env: { ...process.env } });

  const { hashPassword, signToken } = await import('../src/auth.js');
  const user = await prisma.user.create({
    data: { username: 'pm-tree', password: await hashPassword('pm-pass'), name: 'Tree PM', role: 'Proje Yoneticisi' },
  });
  pmToken = signToken({ kind: 'pm', isPM: true, userId: user.id });

  proj = await prisma.project.create({ data: { name: 'Tree Proje', description: 'Test' } });

  userReq = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-001', title: 'Kok', type: 'User Requirement', status: 'In Review' },
  });
  sysReq = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SYS-001',
      title: 'Orta',
      type: 'System Requirement',
      status: 'In Review',
      parentId: userReq.id,
    },
  });
  swLeaf = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SW-001',
      title: 'Yaprak',
      type: 'Software Requirement',
      status: 'In Review',
      parentId: sysReq.id,
    },
  });
  // Sahipsiz (orphan) bir Hardware requirement — kok listede gorunmeli ama hasChildren=false olmali.
  await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-HW-001',
      title: 'Sahipsiz',
      type: 'Hardware Requirement',
      status: 'In Review',
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

// --- getTreeChildren ---------------------------------------------------------

test('getTreeChildren: parentId=null kok dugumleri dondurur, hasChildren dogru', async () => {
  const { getTreeChildren } = await import('../src/tree.js');
  const roots = await getTreeChildren(proj.id, null);
  assert.equal(roots.length, 2); // userReq + orphan HW
  const byTextId = Object.fromEntries(roots.map((r) => [r.text_id, r]));
  assert.equal(byTextId['REQ-USR-001'].hasChildren, true);
  assert.equal(byTextId['REQ-HW-001'].hasChildren, false);
});

test('getTreeChildren: bir dugumun SADECE dogrudan cocuklari doner (tum agac degil)', async () => {
  const { getTreeChildren } = await import('../src/tree.js');
  const children = await getTreeChildren(proj.id, userReq.id);
  assert.equal(children.length, 1);
  assert.equal(children[0].text_id, 'REQ-SYS-001');
  assert.equal(children[0].hasChildren, true);
});

test('getTreeChildren: yaprak dugumun cocugu yoktur', async () => {
  const { getTreeChildren } = await import('../src/tree.js');
  const children = await getTreeChildren(proj.id, swLeaf.id);
  assert.equal(children.length, 0);
});

test('getTreeChildren: gecersiz projectId UUID ile firlatir', async () => {
  const { getTreeChildren } = await import('../src/tree.js');
  await assert.rejects(() => getTreeChildren("x'; DROP TABLE --", null), /invalid/i);
});

test('getTreeChildren: gecersiz parentId UUID ile firlatir', async () => {
  const { getTreeChildren } = await import('../src/tree.js');
  await assert.rejects(() => getTreeChildren(proj.id, "x'; DROP TABLE --"), /invalid/i);
});

// --- getTreeAncestorPath ------------------------------------------------------

test('getTreeAncestorPath: yaprak icin kokten hedefe siralanmis zincir doner', async () => {
  const { getTreeAncestorPath } = await import('../src/tree.js');
  const path = await getTreeAncestorPath(proj.id, swLeaf.id);
  assert.equal(path.length, 3);
  assert.deepEqual(
    path.map((p) => p.text_id),
    ['REQ-USR-001', 'REQ-SYS-001', 'REQ-SW-001'],
  );
});

test('getTreeAncestorPath: kok dugum icin tek elemanli zincir doner', async () => {
  const { getTreeAncestorPath } = await import('../src/tree.js');
  const path = await getTreeAncestorPath(proj.id, userReq.id);
  assert.equal(path.length, 1);
  assert.equal(path[0].text_id, 'REQ-USR-001');
});

test('getTreeAncestorPath: var olmayan reqId icin null doner', async () => {
  const { getTreeAncestorPath } = await import('../src/tree.js');
  const path = await getTreeAncestorPath(proj.id, '00000000-0000-0000-0000-000000000000');
  assert.equal(path, null);
});

test('getTreeAncestorPath: gecersiz reqId UUID ile firlatir', async () => {
  const { getTreeAncestorPath } = await import('../src/tree.js');
  await assert.rejects(() => getTreeAncestorPath(proj.id, "x'; DROP TABLE --"), /invalid/i);
});

// --- Endpoint'ler --------------------------------------------------------------

test('GET /requirements/tree — parentId yoksa kok dugumleri doner', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/requirements/tree`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 2);
});

test('GET /requirements/tree?parentId=... — sadece o dugumun cocuklari doner', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/requirements/tree?parentId=${sysReq.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].text_id, 'REQ-SW-001');
});

test('GET /requirements/:id/ancestors — yaprak icin 3 elemanli path doner', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/requirements/${swLeaf.id}/ancestors`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.path.length, 3);
});

test('GET /requirements/:id/ancestors — var olmayan id icin 404', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/requirements/00000000-0000-0000-0000-000000000000/ancestors`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 404);
});

test('GET /requirements/:id — mevcut duz-liste endpoint bozulmadi', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/requirements/${swLeaf.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.text_id, 'REQ-SW-001');
});
