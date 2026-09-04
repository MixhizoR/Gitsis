// ============================================================================
//  treeOps.test.js — PBS agaci yapisal islemleri: tasima (move), bolme (split),
//  birlestirme (merge). Issue #9 / Adim 3.
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
const { moveRequirement, splitRequirement, mergeRequirements } = await import('../src/treeOps.js');

let proj;
let pmToken;

// Her testten once temiz bir agac kurar: User(root) -> System(mid) -> Software(leaf1, leaf2 kardes)
async function seedTree() {
  await prisma.auditLog.deleteMany({ where: { projectId: proj.id } });
  await prisma.traceabilityLink.deleteMany({ where: { projectId: proj.id } });
  await prisma.requirement.deleteMany({ where: { projectId: proj.id } });

  const root = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-001', title: 'Kok', type: 'User Requirement', status: 'In Review' },
  });
  const root2 = await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-USR-002', title: 'Kok2', type: 'User Requirement', status: 'In Review' },
  });
  const mid = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SYS-001',
      title: 'Orta',
      type: 'System Requirement',
      status: 'In Review',
      parentId: root.id,
    },
  });
  const leaf1 = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SW-001',
      title: 'Yaprak1',
      type: 'Software Requirement',
      status: 'In Review',
      parentId: mid.id,
    },
  });
  const leaf2 = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SW-002',
      title: 'Yaprak2',
      type: 'Software Requirement',
      status: 'In Review',
      parentId: mid.id,
    },
  });
  await prisma.traceabilityLink.createMany({
    data: [
      { projectId: proj.id, fromId: root.id, toId: mid.id, type: 'Satisfies', createdBy: 'seed' },
      { projectId: proj.id, fromId: mid.id, toId: leaf1.id, type: 'Satisfies', createdBy: 'seed' },
      { projectId: proj.id, fromId: mid.id, toId: leaf2.id, type: 'Satisfies', createdBy: 'seed' },
    ],
  });
  return { root, root2, mid, leaf1, leaf2 };
}

before(async () => {
  resetDb();

  const { hashPassword, signToken } = await import('../src/auth.js');
  const user = await prisma.user.create({
    data: {
      username: 'pm-treeops',
      password: await hashPassword('pm-pass'),
      name: 'TreeOps PM',
      role: 'Proje Yoneticisi',
    },
  });
  pmToken = signToken({ kind: 'pm', isPM: true, userId: user.id });
  proj = await prisma.project.create({ data: { name: 'TreeOps Proje', description: 'Test' } });
});

beforeEach(async () => {
  await seedTree();
});

after(async () => {
  await prisma.$disconnect();
});

// --- moveRequirement ----------------------------------------------------------

test('moveRequirement: baska bir uygun ust dugume tasir, Satisfies bagini senkronlar', async () => {
  const { root, root2, leaf1 } = await seedTree();
  const mid2 = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SYS-002',
      title: 'Orta2',
      type: 'System Requirement',
      status: 'In Review',
      parentId: root2.id,
    },
  });
  const updated = await moveRequirement(prisma, proj.id, mid2.id, root.id, 'tester');
  assert.equal(updated.parentId, root.id);
  const link = await prisma.traceabilityLink.findFirst({
    where: { projectId: proj.id, type: 'Satisfies', toId: mid2.id },
  });
  assert.equal(link.fromId, root.id);
  void leaf1;
});

test('moveRequirement: dongusel tasima (kendi alt agacinin altina) 400 firlatir', async () => {
  const { mid, leaf1 } = await seedTree();
  await assert.rejects(
    () => moveRequirement(prisma, proj.id, mid.id, leaf1.id, 'tester'),
    (err) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('moveRequirement: kendine tasima 400 firlatir', async () => {
  const { mid } = await seedTree();
  await assert.rejects(
    () => moveRequirement(prisma, proj.id, mid.id, mid.id, 'tester'),
    (err) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('moveRequirement: tip kuraliyla celisen ust 400 firlatir (Software altina System tasima)', async () => {
  const { leaf1, mid } = await seedTree();
  await assert.rejects(
    () => moveRequirement(prisma, proj.id, mid.id, leaf1.id, 'tester'),
    (err) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('moveRequirement: kilitli gereksinim tasinamaz (403)', async () => {
  const { mid, root2 } = await seedTree();
  await prisma.requirement.update({ where: { id: mid.id }, data: { locked: true } });
  await assert.rejects(
    () => moveRequirement(prisma, proj.id, mid.id, root2.id, 'tester'),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    },
  );
});

test('moveRequirement: text_id degismez', async () => {
  const { mid, root2 } = await seedTree();
  const before = mid.text_id;
  const updated = await moveRequirement(prisma, proj.id, mid.id, root2.id, 'tester');
  assert.equal(updated.text_id, before);
});

// --- splitRequirement -----------------------------------------------------------

test('splitRequirement: yeni parcalar olusturur, orijinal baglari korunur', async () => {
  const { mid, leaf1 } = await seedTree();
  const before = await prisma.traceabilityLink.count({ where: { projectId: proj.id, fromId: leaf1.id } });
  const { original, created } = await splitRequirement(prisma, proj.id, leaf1.id, ['Parca A', 'Parca B'], 'tester');
  assert.equal(created.length, 2);
  assert.equal(original.id, leaf1.id);
  // Yeni parcalar ayni ust dugume (mid) baglanmis olmali (yapisal Satisfies).
  for (const part of created) {
    assert.equal(part.parentId, mid.id);
    const link = await prisma.traceabilityLink.findFirst({
      where: { projectId: proj.id, type: 'Satisfies', toId: part.id },
    });
    assert.equal(link.fromId, mid.id);
  }
  // Orijinalin kendi baglari degismedi.
  const after = await prisma.traceabilityLink.count({ where: { projectId: proj.id, fromId: leaf1.id } });
  assert.equal(after, before);
});

test('splitRequirement: yeni parcalar benzersiz text_id alir (kara liste ile)', async () => {
  const { leaf1 } = await seedTree();
  const { created } = await splitRequirement(prisma, proj.id, leaf1.id, ['A', 'B', 'C'], 'tester');
  const ids = created.map((c) => c.text_id);
  assert.equal(new Set(ids).size, 3);
  // Onek PROJE bazlidir: <codePrefix>-<TIP>-<NNN>
  const { prefixFor } = await import('../src/constants.js');
  const project = await prisma.project.findUnique({ where: { id: proj.id } });
  const expected = prefixFor(project.codePrefix, 'Software Requirement') + '-';
  assert.ok(
    ids.every((id) => id.startsWith(expected)),
    `beklenen onek: ${expected}, gelen: ${ids.join(', ')}`,
  );
});

test('splitRequirement: kilitli gereksinim bolunemez (403)', async () => {
  const { leaf1 } = await seedTree();
  await prisma.requirement.update({ where: { id: leaf1.id }, data: { locked: true } });
  await assert.rejects(
    () => splitRequirement(prisma, proj.id, leaf1.id, ['A'], 'tester'),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    },
  );
});

test('splitRequirement: bos baslik listesi 400 firlatir', async () => {
  const { leaf1 } = await seedTree();
  await assert.rejects(
    () => splitRequirement(prisma, proj.id, leaf1.id, [], 'tester'),
    (err) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

// --- mergeRequirements -----------------------------------------------------------

test('mergeRequirements: kardesleri en eski hayatta kalanda birlestirir, baglari tasir', async () => {
  const { mid, leaf1, leaf2 } = await seedTree();
  const survivor = await mergeRequirements(prisma, proj.id, [leaf1.id, leaf2.id], 'tester');
  assert.equal(survivor.id, leaf1.id); // leaf1 once olusturuldu -> survivor

  const stillExists = await prisma.requirement.findUnique({ where: { id: leaf2.id } });
  assert.equal(stillExists, null);

  // survivor hala mid'e Satisfies ile bagli olmali (kendi orijinal bagi zaten vardi).
  const link = await prisma.traceabilityLink.findFirst({
    where: { projectId: proj.id, type: 'Satisfies', toId: survivor.id, fromId: mid.id },
  });
  assert.ok(link);
});

test('mergeRequirements: farkli tipte gereksinimler birlestirilemez (400)', async () => {
  const { mid, leaf1 } = await seedTree();
  await assert.rejects(
    () => mergeRequirements(prisma, proj.id, [mid.id, leaf1.id], 'tester'),
    (err) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('mergeRequirements: farkli ust dugume bagli (kardes olmayan) gereksinimler birlestirilemez (400)', async () => {
  const { leaf1 } = await seedTree();
  const otherRoot = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-USR-099',
      title: 'Baska Kok',
      type: 'User Requirement',
      status: 'In Review',
    },
  });
  const otherMid = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SYS-099',
      title: 'Baska Orta',
      type: 'System Requirement',
      status: 'In Review',
      parentId: otherRoot.id,
    },
  });
  const otherLeaf = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-SW-099',
      title: 'Baska Yaprak',
      type: 'Software Requirement',
      status: 'In Review',
      parentId: otherMid.id,
    },
  });
  await assert.rejects(
    () => mergeRequirements(prisma, proj.id, [leaf1.id, otherLeaf.id], 'tester'),
    (err) => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('mergeRequirements: kilitli gereksinim birlestirmeye dahilse 403', async () => {
  const { leaf1, leaf2 } = await seedTree();
  await prisma.requirement.update({ where: { id: leaf2.id }, data: { locked: true } });
  await assert.rejects(
    () => mergeRequirements(prisma, proj.id, [leaf1.id, leaf2.id], 'tester'),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    },
  );
});

test('mergeRequirements: silinen text_id kara listede kalir (yeniden uretilmez)', async () => {
  const { leaf1, leaf2 } = await seedTree();
  const absorbedTextId = leaf2.text_id;
  await mergeRequirements(prisma, proj.id, [leaf1.id, leaf2.id], 'tester');
  const { nextTextId } = await import('../src/idGen.js');
  const next = await nextTextId(prisma, proj.id, 'Software Requirement', false);
  assert.notEqual(next, absorbedTextId);
});

// --- Endpoint smoke testleri ----------------------------------------------------

test('PATCH /requirements/:id/move — 200 doner', async () => {
  const { mid, root2 } = await seedTree();
  const res = await request(app)
    .patch(`/api/projects/${proj.id}/requirements/${mid.id}/move`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ parentId: root2.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.parentId, root2.id);
});

test('POST /requirements/:id/split — 201 doner', async () => {
  const { leaf1 } = await seedTree();
  const res = await request(app)
    .post(`/api/projects/${proj.id}/requirements/${leaf1.id}/split`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ newTitles: ['Parca A'] });
  assert.equal(res.status, 201);
  assert.equal(res.body.created.length, 1);
});

test('POST /requirements/merge — 200 doner', async () => {
  const { leaf1, leaf2 } = await seedTree();
  const res = await request(app)
    .post(`/api/projects/${proj.id}/requirements/merge`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ ids: [leaf1.id, leaf2.id] });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, leaf1.id);
});
