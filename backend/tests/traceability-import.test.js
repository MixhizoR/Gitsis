// ============================================================================
// traceability-import.test.js  —  Issue #3: import doğrulama, atomiklik,
// validateLink, audit, cascade, multer sınırları.
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';
import ExcelJS from 'exceljs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_local_pass_2026',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDS = { username: 'pm-import', password: 'import-123' };
let proj;
let pmToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // zaten var
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: PM_CREDS.username,
      password: await hashPassword(PM_CREDS.password),
      name: 'Import Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Trace Import' } });

  await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-S-400', title: 'R400', type: 'System Requirement' },
  });
  await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-SW-400', title: 'RSW400', type: 'Software Requirement' },
  });
  await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SYS-400', title: 'TSYS400', type: 'System Test' },
  });
  await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SUB-400', title: 'TSUB400', type: 'Sub-system Test' },
  });

  const res = await request(app).post('/api/auth/login').send(PM_CREDS);
  pmToken = res.body.token;
  assert.ok(pmToken);
});

after(async () => {
  await prisma.$disconnect();
});

async function cleanProject() {
  await prisma.traceabilityLink.deleteMany({ where: { projectId: proj.id } });
  await prisma.auditLog.deleteMany({ where: { projectId: proj.id } });
  await prisma.requirement.updateMany({
    where: { projectId: proj.id },
    data: { status: 'In Review' },
  });
  await prisma.testCase.updateMany({
    where: { projectId: proj.id },
    data: { status: 'In Review' },
  });
}

async function buildExcel(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Traceability Matrix');
  ws.addRow(['Gereksinim ID', '', '', '', '', 'Test ID', '', 'Link Tipi', '']);
  for (const r of rows) {
    const row = ws.addRow([]);
    row.getCell(1).value = r.req ?? '';
    row.getCell(6).value = r.test ?? '';
    row.getCell(8).value = r.type ?? '';
  }
  return wb.xlsx.writeBuffer();
}

// ============================================================================
// RED — her yeni davranış önce başarısız olmalı
// ============================================================================

test('T1: geçerli Verifies satırı → 200 ve link oluşur', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'valid.xlsx' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.imported, 1);
  assert.equal(res.body.totalProcessed, 1);
  const link = await prisma.traceabilityLink.findFirst({
    where: { projectId: proj.id },
  });
  assert.ok(link);
  assert.equal(link.type, 'Verifies');
});

test('T2: boş linkType hücresi → reddedilir (default Verifies yok)', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: '' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'empty_type.xlsx' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
  assert.equal(res.body.imported, undefined);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T3: geçersiz linkType → reddedilir', async () => {
  await cleanProject();
  const buf = await buildExcel([
    { req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Satisfies' },
    { req: 'REQ-SW-400', test: 'TC-SYS-400', type: 'Bogus' },
  ]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'bad_type.xlsx' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
  assert.equal(res.body.details.length >= 2, true);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T4: uyumsuz tip çifti → reddedilir', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-SW-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'mismatch.xlsx' });
  assert.equal(res.status, 400);
  assert.ok(res.body.details);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T5: bilinmeyen text_id → reddedilir', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-NOPE', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'unknown_req.xlsx' });
  assert.equal(res.status, 400);
  assert.equal(res.body.details.length > 0, true);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T6: karışık geçerli+geçersiz satır → atomik (0 link)', async () => {
  await cleanProject();
  const buf = await buildExcel([
    { req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' },
    { req: 'REQ-SW-400', test: 'TC-SYS-400', type: 'Verifies' },
  ]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'mixed.xlsx' });
  assert.equal(res.status, 400);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T7: başarılı import sonrası audit kaydı düşer', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'audit.xlsx' });
  assert.equal(res.status, 200);
  const audit = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, message: 'Traceability import completed' },
  });
  assert.ok(audit, 'Audit kaydı bulunamadı');
});

test('T8: başarılı import sonrası cascade (durum güncellemesi)', async () => {
  await cleanProject();
  // test Approved durumunda
  await prisma.testCase.updateMany({ where: { projectId: proj.id }, data: { status: 'In Review' } });
  await prisma.testCase.updateMany({
    where: { projectId: proj.id, text_id: 'TC-SYS-400' },
    data: { status: 'Approved' },
  });
  await prisma.requirement.updateMany({
    where: { projectId: proj.id },
    data: { status: 'In Review' },
  });
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'cascade.xlsx' });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 100)); // cascade async olabilir; aslında await ediliyor
  const reqStatus = await prisma.requirement.findFirst({
    where: { projectId: proj.id, text_id: 'REQ-S-400' },
  });
  assert.equal(reqStatus.status, 'Approved');
});

test('T9: >10MB dosya → 413; .txt → 413', async () => {
  await cleanProject();
  const bigBuf = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
  const resBig = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', bigBuf, { filename: 'big.xlsx' });
  assert.equal(resBig.status, 413);

  const txtBuf = Buffer.from('not an excel');
  const resTxt = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', txtBuf, { filename: 'text.txt' });
  assert.equal(resTxt.status, 413);
});

test('T10: duplicate link → ikinci import 0 ekler, link sayısı 1 kalır', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const r1 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'dup1.xlsx' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.imported, 1);

  const r2 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'dup2.xlsx' });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.imported, 0);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 1);
});
