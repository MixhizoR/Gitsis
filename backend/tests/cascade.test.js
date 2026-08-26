// ============================================================================
//  cascade.test.js — Issue #15: bulk cascade + bulk approval integration.
//  Red-Green: Bu testler cascade.js olmadan yazildi; once basarisiz olduklari
//  gorulecek, sonra cascade.js minimum kodu yazilacak.
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const { recomputeStatusesBulk, recomputeApprovalsBulk } = await import('../src/cascade.js');
const { STATUS } = await import('../src/constants.js');

const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-cas', password: 'pm-pass-1234' };
let proj;
let pmToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // already exists
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Cascade Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Cascade Bulk' } });

  // PM rolü (approve izni: req-system + test-system)
  const role = await prisma.role.create({
    data: {
      projectId: proj.id,
      name: 'Muhendis',
      permissions: {
        approve: { enabled: true, components: ['req-system', 'test-system'] },
      },
    },
  });

  // 2 yetkili personel
  await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: role.id,
      firstName: 'Ali',
      lastName: 'Veli',
      passcode: 'CASC-0001',
    },
  });
  await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: role.id,
      firstName: 'Ayse',
      lastName: 'Kara',
      passcode: 'CASC-0002',
    },
  });

  // PM login
  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = res.body.token;
  assert.ok(pmToken);
});

after(async () => {
  await prisma.$disconnect();
});

// --- recomputeStatusesBulk --------------------------------------------------

test('recomputeStatusesBulk: tüm Verifies testleri Approved → req Approved, audit yazılır', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-100',
      title: 'R100',
      type: 'System Requirement',
    },
  });
  const t1 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-100', title: 'T100', type: 'System Test', status: STATUS.APPROVED },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqRow.id, toId: t1.id, type: 'Verifies' },
  });

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 1, `expected at least 1 change, got ${n}`);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.APPROVED);

  const audit = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, entityId: reqRow.id, action: 'AUTO_STATUS' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(audit, 'AUTO_STATUS audit yazılmadı');
  assert.equal(audit.oldValue, STATUS.IN_REVIEW);
  assert.equal(audit.newValue, STATUS.APPROVED);
});

test('recomputeStatusesBulk: bir test Rejected → req Rejected, sadece o req güncellenir', async () => {
  // İzole test: ayrı req + 2 test
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-101',
      title: 'R101',
      type: 'System Requirement',
    },
  });
  const t1 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-101', title: 'T101', type: 'System Test', status: STATUS.APPROVED },
  });
  const t2 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-102', title: 'T102', type: 'System Test', status: STATUS.REJECTED },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqRow.id, toId: t1.id, type: 'Verifies' },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqRow.id, toId: t2.id, type: 'Verifies' },
  });

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 1, `expected at least 1 change, got ${n}`);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.REJECTED);
});

test("recomputeStatusesBulk: Verifies bağı yok → req In Review'a sıfırlanır", async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-102',
      title: 'R102',
      type: 'System Requirement',
      status: STATUS.APPROVED, // yanlış (bağ yok)
    },
  });

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 1, `expected at least 1 change, got ${n}`);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.IN_REVIEW);
});

test('recomputeStatusesBulk: zaten doğru olan req yazılmaz (updatedAt değişmez, audit yok)', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-103',
      title: 'R103',
      type: 'System Requirement', // Verifies bağı yok → In Review (default)
    },
  });
  const before = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(before.status, STATUS.IN_REVIEW);

  // Saat ilerlesin ki updatedAt farkı ölçülebilir olsun.
  await new Promise((r) => setTimeout(r, 20));

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 0);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.IN_REVIEW);
  assert.equal(
    after.updatedAt.getTime(),
    before.updatedAt.getTime(),
    'değişmeyen req için DB yazması olmamalı (updatedAt aynı kalmalı)',
  );

  const audits = await prisma.auditLog.count({
    where: { projectId: proj.id, entityId: reqRow.id, action: 'AUTO_STATUS' },
  });
  assert.equal(audits, 0, 'değişmeyen req için AUTO_STATUS audit yazılmamalı');
});

// --- recomputeApprovalsBulk -------------------------------------------------

test('recomputeApprovalsBulk: PM + 2 personel oyu → requirement Approved+locked', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-200',
      title: 'R200',
      type: 'System Requirement',
    },
  });

  // PM oyu
  await prisma.approval.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      entityId: reqRow.id,
      voterId: 'PM',
      voterName: 'PM',
    },
  });
  // 2 personel oyu
  const personnel = await prisma.personnel.findMany({ where: { projectId: proj.id } });
  assert.equal(personnel.length, 2);
  for (const p of personnel) {
    await prisma.approval.create({
      data: {
        projectId: proj.id,
        entityType: 'requirement',
        entityId: reqRow.id,
        voterId: p.id,
        voterName: `${p.firstName} ${p.lastName}`,
        personnelId: p.id,
      },
    });
  }

  await recomputeApprovalsBulk(prisma, proj.id);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.approvalStatus, 'Approved');
  assert.equal(after.locked, true);
});

test('recomputeApprovalsBulk: bir oy eksik → Pending, unlocked', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-201',
      title: 'R201',
      type: 'System Requirement',
    },
  });

  // Sadece PM + 1 personel (2. eksik)
  await prisma.approval.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      entityId: reqRow.id,
      voterId: 'PM',
      voterName: 'PM',
    },
  });
  const [first] = await prisma.personnel.findMany({ where: { projectId: proj.id } });
  await prisma.approval.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      entityId: reqRow.id,
      voterId: first.id,
      voterName: `${first.firstName} ${first.lastName}`,
      personnelId: first.id,
    },
  });

  await recomputeApprovalsBulk(prisma, proj.id);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.approvalStatus, 'Pending');
  assert.equal(after.locked, false);
});

test('recomputeApprovalsBulk: zaten Approved olan req yazılmaz (updatedAt değişmez)', async () => {
  // R200 önceki testte Approved+locked oldu; tüm oylar hâlâ duruyor.
  const reqRow = await prisma.requirement.findFirst({
    where: { projectId: proj.id, text_id: 'REQ-S-200' },
  });
  assert.equal(reqRow.approvalStatus, 'Approved');
  assert.equal(reqRow.locked, true);
  const before = reqRow;

  await new Promise((r) => setTimeout(r, 20));

  await recomputeApprovalsBulk(prisma, proj.id);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.approvalStatus, 'Approved');
  assert.equal(after.locked, true);
  assert.equal(
    after.updatedAt.getTime(),
    before.updatedAt.getTime(),
    'değişmeyen onay için DB yazması olmamalı (updatedAt aynı kalmalı)',
  );
});

// --- POST /recompute endpoint ----------------------------------------------

test('POST /api/projects/:pid/recompute: değişen sayıyı döner', async () => {
  const res = await request(app).post(`/api/projects/${proj.id}/recompute`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.updated, 'number');
});
