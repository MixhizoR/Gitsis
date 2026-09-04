// ============================================================================
//  seed.test.js — Issue #13 regresyon: seed.js artik sabit NOW/AUTHOR
//  kullanmiyor; createdAt/updatedAt Prisma default'larina, author/createdBy
//  'system.seed' sistem imzasina birakildi.
//
//  TDD yapisi:
//    - before(): TEK SEFER db push --force-reset + runSeed()
//    - 5 davranissal test (hepsi ayni seeded DB uzerinde hizli okuma)
//    - Test 4 kendi icinde ikinci runSeed() cagirir (idempotency)
//
//  Calistirma on kosullari (api.test.js ile ayni):
//    Yerel: docker compose up -d db   (test DB'si docker tarafindan yaratilir)
//    CI:    TEST_DATABASE_URL env degiskeni hazir Postgres'e isaret eder.
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
// Ortak env + DB reset (tek dogruluk kaynagi: tests/_setup.js).
import './_setup.js';
import { resetDb } from './_setup.js';

const { PrismaClient } = await import('@prisma/client');
const { runSeed } = await import('../src/seed.js');

const prisma = new PrismaClient();
const TOLERANCE_MS = 5000;

before(async () => {
  // Sifirla + default seed (drone/IHA demo projesi).
  resetDb();
  await runSeed();
});

after(async () => {
  await prisma.$disconnect();
});

// --- Test 1: Project.createdAt gercek zamana yakin -------------------------
test('seed: Project.createdAt "system.seed" degil, gercek zamana yakin (±5s)', async () => {
  const project = await prisma.project.findFirst();
  assert.ok(project, 'seed en az bir Project yaratmis olmali');
  const diff = Math.abs(Date.now() - project.createdAt.getTime());
  assert.ok(diff <= TOLERANCE_MS, `createdAt gercek zamana yakin olmali (±${TOLERANCE_MS}ms); sapma ${diff}ms`);
});

// --- Test 2: Project.updatedAt gercek zamana yakin -------------------------
test("seed: Project.updatedAt gercek zamana yakin (±5s) ve createdAt'ten kucuk degil", async () => {
  const project = await prisma.project.findFirst();
  assert.ok(project);
  const diff = Math.abs(Date.now() - project.updatedAt.getTime());
  assert.ok(diff <= TOLERANCE_MS, `updatedAt gercek zamana yakin olmali (±${TOLERANCE_MS}ms); sapma ${diff}ms`);
  assert.ok(project.updatedAt >= project.createdAt, "updatedAt createdAt'ten kucuk olmamali");
});

// --- Test 3: Requirement.author = 'system.seed' ----------------------------
test('seed: Requirement.author = "system.seed" ve createdAt gercek zamana yakin', async () => {
  const sample = await prisma.requirement.findFirst();
  assert.ok(sample, 'seed en az bir Requirement yaratmis olmali');
  assert.equal(sample.author, 'system.seed');
  const diff = Math.abs(Date.now() - sample.createdAt.getTime());
  assert.ok(diff <= TOLERANCE_MS, `Requirement.createdAt gercek zamana yakin olmali; sapma ${diff}ms`);
});

// --- Test 4: Idempotency — ikinci runSeed() mevcut veriye dokunmaz -------
test('seed: ikinci runSeed() idempotent — sentinel korunur, mevcut veri bozulmaz', async () => {
  // onceki before() sonrasi DB dolu: 1 project (Otopilot), 72 req, 16 test, 58 link.
  const before = {
    projects: await prisma.project.count(),
    requirements: await prisma.requirement.count(),
    testCases: await prisma.testCase.count(),
    links: await prisma.traceabilityLink.count(),
  };
  const otopilot = await prisma.project.findFirst({ where: { name: 'Otopilot / Ucus Kontrol Sistemi' } });
  assert.ok(otopilot, 'resmi seed projesi mevcut olmali');
  const otopilotCreatedAt = otopilot.createdAt;
  const otopilotUpdatedAt = otopilot.updatedAt;

  // Sentinel: ikinci seed bunu SILMEMELI, degistirmemeli.
  const sentinel = await prisma.project.create({
    data: {
      name: '__idempotency_sentinel__',
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
      updatedAt: new Date('2000-01-01T00:00:00.000Z'),
    },
  });

  // Ikinci seed cagir.
  await runSeed();

  const after = {
    projects: await prisma.project.count(),
    requirements: await prisma.requirement.count(),
    testCases: await prisma.testCase.count(),
    links: await prisma.traceabilityLink.count(),
  };

  // Sentinel korunmali.
  const sentinelAfter = await prisma.project.findUnique({ where: { id: sentinel.id } });
  assert.ok(sentinelAfter, 'sentinel ikinci seed sonrasi hala mevcut olmali');
  assert.equal(sentinelAfter.name, '__idempotency_sentinel__');
  assert.equal(
    sentinelAfter.createdAt.toISOString(),
    new Date('2000-01-01T00:00:00.000Z').toISOString(),
    'sentinel.createdAt seed tarafindan degistirilmemeli',
  );

  // Mevcut Otopilot projesinin createdAt/updatedAt degismemeli.
  const otopilotAfter = await prisma.project.findFirst({
    where: { name: 'Otopilot / Ucus Kontrol Sistemi' },
  });
  assert.equal(
    otopilotAfter.createdAt.toISOString(),
    otopilotCreatedAt.toISOString(),
    'mevcut projenin createdAt ikinci seed ile degismemeli',
  );
  assert.equal(
    otopilotAfter.updatedAt.toISOString(),
    otopilotUpdatedAt.toISOString(),
    'mevcut projenin updatedAt ikinci seed ile degismemeli',
  );

  // Sadece sentinel eklendigi icin +1 olmali; mevcut kayitlar uretilmemeli.
  assert.equal(after.projects, before.projects + 1, 'sentinel eklendigi icin +1');
  assert.equal(after.requirements, before.requirements, 'mevcut requirement sayisi ayni');
  assert.equal(after.testCases, before.testCases, 'mevcut testCases sayisi ayni');
  assert.equal(after.links, before.links, 'mevcut link sayisi ayni');
});

// --- Test 5: TestCase.author ve TraceabilityLink.createdBy = 'system.seed' -
test('seed: TestCase.author = "system.seed" ve TraceabilityLink.createdBy = "system.seed"', async () => {
  const tc = await prisma.testCase.findFirst();
  assert.ok(tc, 'seed en az bir TestCase yaratmis olmali');
  assert.equal(tc.author, 'system.seed');

  const link = await prisma.traceabilityLink.findFirst();
  assert.ok(link, 'seed en az bir TraceabilityLink yaratmis olmali');
  assert.equal(link.createdBy, 'system.seed');
});
