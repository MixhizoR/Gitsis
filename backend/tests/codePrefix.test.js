// ============================================================================
//  codePrefix.test.js — text_id kod onegi degistirme (proje bazli).
//  Kapsam: onek guncelleme, mevcut kayitlarin tasinmasi (numara korunur),
//  eski kodun KARA LISTEDE kalmasi, dogrulama, PM disi 403.
// ============================================================================
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, beforeEach, after, test } from 'node:test';
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
const { nextTextId } = await import('../src/idGen.js');

let proj;
let pmToken;
let personnelToken;

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
    data: { username: 'pm-prefix', password: await hashPassword('p'), name: 'PM', role: 'Proje Yoneticisi' },
  });
  pmToken = signToken({ kind: 'pm', isPM: true, userId: user.id });
  proj = await prisma.project.create({ data: { name: 'Prefix Proje' } });
  const role = await prisma.role.create({ data: { projectId: proj.id, name: 'Muh', permissions: {} } });
  const person = await prisma.personnel.create({
    data: { projectId: proj.id, roleId: role.id, firstName: 'A', lastName: 'B', passcode: 'PRE-1' },
  });
  personnelToken = signToken({ kind: 'personnel', isPM: false, projectId: proj.id, personnelId: person.id });
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { projectId: proj.id } });
  await prisma.requirement.deleteMany({ where: { projectId: proj.id } });
  await prisma.glossaryTerm.deleteMany({ where: { projectId: proj.id } });
  await prisma.project.update({ where: { id: proj.id }, data: { codePrefix: 'EH-KAHVE-TİD' } });
});

after(async () => {
  await prisma.$disconnect();
});

const asPM = (r) => r.set('Authorization', `Bearer ${pmToken}`);

test('varsayilan onek ile uretilen kod: EH-KAHVE-TİD-<TIP>-<NNN>', async () => {
  const res = await asPM(request(app).post(`/api/projects/${proj.id}/requirements`)).send({
    type: 'System Requirement',
    title: 'A',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.text_id, 'EH-KAHVE-TİD-SYS-001');
});

test('POST /code-prefix — onek degisir, YENI kayitlar yeni oneki alir', async () => {
  const res = await asPM(request(app).post(`/api/projects/${proj.id}/code-prefix`)).send({
    codePrefix: 'EH-OTOPILOT-TİD',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.codePrefix, 'EH-OTOPILOT-TİD');

  const req = await asPM(request(app).post(`/api/projects/${proj.id}/requirements`)).send({
    type: 'User Requirement',
    title: 'B',
  });
  assert.equal(req.body.text_id, 'EH-OTOPILOT-TİD-USR-001');
});

test('migrateExisting: mevcut kayitlar tasinir, NUMARA korunur', async () => {
  await asPM(request(app).post(`/api/projects/${proj.id}/requirements`)).send({
    type: 'System Requirement',
    title: 'A',
  }); // -> EH-KAHVE-TİD-SYS-001
  await asPM(request(app).post(`/api/projects/${proj.id}/requirements`)).send({
    type: 'System Requirement',
    title: 'B',
  }); // -> EH-KAHVE-TİD-SYS-002

  const res = await asPM(request(app).post(`/api/projects/${proj.id}/code-prefix`)).send({
    codePrefix: 'YENI-KOD',
    migrateExisting: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.renamed, 2);

  const rows = await prisma.requirement.findMany({
    where: { projectId: proj.id },
    orderBy: { text_id: 'asc' },
  });
  assert.deepEqual(
    rows.map((r) => r.text_id),
    ['YENI-KOD-SYS-001', 'YENI-KOD-SYS-002'],
  );
});

test('migrateExisting=false ise mevcut kayitlara DOKUNULMAZ', async () => {
  await asPM(request(app).post(`/api/projects/${proj.id}/requirements`)).send({
    type: 'System Requirement',
    title: 'A',
  });
  await asPM(request(app).post(`/api/projects/${proj.id}/code-prefix`)).send({ codePrefix: 'BASKA' });
  const row = await prisma.requirement.findFirst({ where: { projectId: proj.id } });
  assert.equal(row.text_id, 'EH-KAHVE-TİD-SYS-001');
});

test('tasima sonrasi ESKI kod kara listede kalir (yeniden uretilmez)', async () => {
  await asPM(request(app).post(`/api/projects/${proj.id}/requirements`)).send({
    type: 'System Requirement',
    title: 'A',
  }); // EH-KAHVE-TİD-SYS-001
  await asPM(request(app).post(`/api/projects/${proj.id}/code-prefix`)).send({
    codePrefix: 'YENI-KOD',
    migrateExisting: true,
  });
  // Oneki geri al: eski kod (EH-KAHVE-TİD-SYS-001) audit'te kayitli oldugu
  // icin bir sonraki uretim 001'i TEKRAR kullanmamalidir.
  await asPM(request(app).post(`/api/projects/${proj.id}/code-prefix`)).send({ codePrefix: 'EH-KAHVE-TİD' });
  const next = await nextTextId(prisma, proj.id, 'System Requirement', false);
  assert.notEqual(next, 'EH-KAHVE-TİD-SYS-001');
});

test('gecersiz onek (bosluk / ozel karakter) 400 doner', async () => {
  for (const bad of ['', '   ', 'AB CD', 'AB/CD']) {
    const res = await asPM(request(app).post(`/api/projects/${proj.id}/code-prefix`)).send({ codePrefix: bad });
    assert.equal(res.status, 400, `"${bad}" reddedilmeliydi`);
  }
});

test('PM olmayan kullanici onegi degistiremez (403)', async () => {
  const res = await request(app)
    .post(`/api/projects/${proj.id}/code-prefix`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ codePrefix: 'OLMAZ' });
  assert.equal(res.status, 403);
});
