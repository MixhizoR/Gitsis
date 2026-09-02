// ============================================================================
//  issue53.test.js — Issue #53: 5 hatayı tek PR'da düzelt.
//  TDD: Bu testler önce yazıldı (kırmızı), sonra düzeltmeler uygulandı.
//
//  Bug 1: vote/unlock — voterId body'den değil JWT'den türetilmeli;
//          'PM' sentinel kaldırılmalı; audit actor gerçek id; unlock yalnızca PM
//  Bug 2: impact.js findUnique → 500
//  Bug 3: glossary POST/PUT cleanRichText + audit
//  Bug 4: server.js'deki ölü reqif route + fazladan } silinmeli
//  Bug 5: GET /requirements/:id, /testcases/:id, /glossary/:id projectId scope
//
//  Çalıştırma: docker compose up -d db  +  npm test backend/tests/issue53.test.js
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ehsim-issue53-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-issue53', password: 'pm-pass-issue53' };
let pmToken;
let pmUserId;
let projA;
let projB;
let reqA;
let reqB;
let personnelToken;
let personnelA; // kendi oy hakkı olan personel (approve enabled + comp)
let personnelB; // yetkisiz personel (approve yok)
let personnelBToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // Zaten var.
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');
  const u = await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Issue53 PM',
      role: 'Proje Yoneticisi',
    },
  });
  pmUserId = u.id;

  projA = await prisma.project.create({ data: { name: 'Issue53 Proje A' } });
  projB = await prisma.project.create({ data: { name: 'Issue53 Proje B' } });

  reqA = await prisma.requirement.create({
    data: { projectId: projA.id, text_id: 'REQ-SYS-A01', title: 'A gereksinimi', type: 'System Requirement' },
  });
  reqB = await prisma.requirement.create({
    data: { projectId: projB.id, text_id: 'REQ-SYS-B01', title: 'B gereksinimi', type: 'System Requirement' },
  });

  // A projesi: approve izni olan rol + personel
  const roleApprove = await prisma.role.create({
    data: {
      projectId: projA.id,
      name: 'Sistem Muhendisi',
      permissions: {
        approve: { enabled: true, components: ['req-system'] },
      },
    },
  });
  personnelA = await prisma.personnel.create({
    data: {
      projectId: projA.id,
      roleId: roleApprove.id,
      firstName: 'Onay',
      lastName: 'Personel',
      passcode: 'K2X4M',
    },
  });

  // Personel token al
  const t1 = await request(app).post('/api/auth/passcode').send({ passcode: 'K2X4M' });
  assert.equal(t1.status, 200, 'personel passcode login basarili olmali');
  personnelToken = t1.body.token;

  // Aynı projede approve izni OLMAYAN ikinci personel
  const roleNoApprove = await prisma.role.create({
    data: { projectId: projA.id, name: 'Gozlemci', permissions: {} },
  });
  const p2 = await prisma.personnel.create({
    data: {
      projectId: projA.id,
      roleId: roleNoApprove.id,
      firstName: 'Izin',
      lastName: 'Siz',
      passcode: 'Z7Y3N',
    },
  });
  const t2 = await request(app).post('/api/auth/passcode').send({ passcode: 'Z7Y3N' });
  assert.equal(t2.status, 200);
  personnelB = p2;
  personnelBToken = t2.body.token;
});

test('vote: body voterId PM beyan etse bile kayit PM userId ile yazilir (kimlik client beyanina dayanmaz)', async () => {
  // Yeni bir kayıt üzerinde, body'de voterId:'PM' yazılsa bile DB gerçek userId yazmalı
  const r2 = await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-A02',
      title: 'Oy test gereksinim',
      type: 'System Requirement',
    },
  });
  const r = await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ entityType: 'requirement', entityId: r2.id, voterId: 'PM', voterName: 'Sahte' });
  assert.equal(r.status, 200);
  const appr = await prisma.approval.findFirst({
    where: { projectId: projA.id, entityType: 'requirement', entityId: r2.id },
  });
  assert.ok(appr);
  assert.equal(appr.voterId, pmUserId, "Body'deki voterId göz ardı edilir, token'dan alınır");
  assert.notEqual(appr.voterId, 'PM');
});

test('vote: personel kendi userId ile oy atar (personnelId body ile değil JWT ile)', async () => {
  const r3 = await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-A03',
      title: 'Personel oy gereksinim',
      type: 'System Requirement',
    },
  });
  const r = await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ entityType: 'requirement', entityId: r3.id });
  assert.equal(r.status, 200);
  const appr = await prisma.approval.findFirst({
    where: { projectId: projA.id, entityType: 'requirement', entityId: r3.id },
  });
  assert.ok(appr);
  assert.equal(appr.voterId, personnelA.id, 'voterId = personelin kendi idsi');
  assert.notEqual(appr.voterId, 'PM');
});

test('vote: izni olmayan personel oy atamaz (403)', async () => {
  const r4 = await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-A04',
      title: 'Izin yok gereksinim',
      type: 'System Requirement',
    },
  });
  const r = await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${personnelBToken}`)
    .send({ entityType: 'requirement', entityId: r4.id });
  assert.equal(r.status, 403, `403 olmali, gelen: ${r.status}`);
});

test('vote: aynı kişi çift oy atamaz (toggle) → ikinci oy mevcut oyu siler', async () => {
  const r5 = await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-A05',
      title: 'Toggle gereksinim',
      type: 'System Requirement',
    },
  });
  const first = await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ entityType: 'requirement', entityId: r5.id });
  assert.equal(first.status, 200);
  const second = await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ entityType: 'requirement', entityId: r5.id });
  assert.equal(second.status, 200);
  const count = await prisma.approval.count({
    where: { projectId: projA.id, entityType: 'requirement', entityId: r5.id },
  });
  assert.equal(count, 0, 'Toggle: ikinci oy mevcut oyu silmeli');
});

test('unlock: yalnızca PM token ile çalışır (personel 403 alır)', async () => {
  // Önce onay zincirini kur: PM + A personeli oy atsın, kilitlensin.
  const r6 = await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-A06',
      title: 'Unlock test gereksinim',
      type: 'System Requirement',
    },
  });
  await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ entityType: 'requirement', entityId: r6.id });
  await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ entityType: 'requirement', entityId: r6.id });
  const locked = await prisma.requirement.findUnique({ where: { id: r6.id } });
  assert.equal(locked.locked, true, 'Tum oylar tamam, kilitli olmali');

  // Personel unlock denerse 403
  const personelUnlock = await request(app)
    .post(`/api/projects/${projA.id}/approvals/unlock`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ entityType: 'requirement', entityId: r6.id });
  assert.equal(personelUnlock.status, 403, `Personel unlock 403 olmali, gelen: ${personelUnlock.status}`);

  // PM unlock başarılı
  const pmUnlock = await request(app)
    .post(`/api/projects/${projA.id}/approvals/unlock`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ entityType: 'requirement', entityId: r6.id });
  assert.equal(pmUnlock.status, 200);
  const after = await prisma.requirement.findUnique({ where: { id: r6.id } });
  assert.equal(after.locked, false, 'PM unlock sonrasi kilit acilmali');
});

test('unlock: audit actor PM userId olarak yazilir (sentinel "Proje Yoneticisi" string degil)', async () => {
  // r6 üzerinde PM unlock yaptık; audit'i kontrol edelim.
  const audit = await prisma.auditLog.findFirst({
    where: { projectId: projA.id, action: 'UNLOCK', entityId: r6.id },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(audit, 'UNLOCK audit kaydi olmali');
  // Gerçek PM userId içermeli (string 'Proje Yoneticisi' hardcoded olmamali)
  assert.ok(audit.actor && audit.actor.includes(pmUserId), `actor PM userId icermeli, gelen: ${audit.actor}`);
});

test('vote: kilitli kayit icin PM token ile oy geri cekilebilir (unlock kilit yolu)', async () => {
  // r6 PM'in oyu geri cekilmis olmali (unlock). Yeni oy deneyelim.
  const again = await request(app)
    .post(`/api/projects/${projA.id}/approvals/vote`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ entityType: 'requirement', entityId: r6.id });
  assert.equal(again.status, 200);
});

// ============================================================================
//  Bug 2: impact.js findUnique → 500
// ============================================================================

test('impact: gecerli reqId ile 200 doner (findUnique 500 degil)', async () => {
  const r = await request(app)
    .get(`/api/projects/${projA.id}/impact?reqId=${reqA.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(r.status, 200, `200 olmali, gelen: ${r.status} ${JSON.stringify(r.body)}`);
  assert.ok(r.body.root);
  assert.equal(r.body.root.id, reqA.id);
});

test('impact: baska projenin reqId ile 404 doner', async () => {
  const r = await request(app)
    .get(`/api/projects/${projA.id}/impact?reqId=${reqB.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(r.status, 404, `404 olmali, gelen: ${r.status}`);
});

// ============================================================================
//  Bug 3: glossary XSS + audit
// ============================================================================

test('glossary POST: definition HTML temizlenir (XSS engellenir)', async () => {
  const xss = '<p>iyi</p><script>alert(1)</script><img src=x onerror=alert(1)>';
  const r = await request(app)
    .post(`/api/projects/${projA.id}/glossary`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ term: 'XSS Test', definition: xss });
  assert.equal(r.status, 201);
  const row = await prisma.glossaryTerm.findUnique({ where: { id: r.body.id } });
  assert.ok(!row.definition.includes('<script>'), 'script etiketi temizlenmeli');
  assert.ok(!row.definition.toLowerCase().includes('onerror'), 'onerror temizlenmeli');
  assert.ok(row.definition.includes('<p>iyi</p>'), 'beyaz listedeki etiket korunmali');
});

test('glossary POST: audit CREATE kaydi yazilir', async () => {
  const r = await request(app)
    .post(`/api/projects/${projA.id}/glossary`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ term: 'Audit Test', definition: 'deneme' });
  assert.equal(r.status, 201);
  const audit = await prisma.auditLog.findFirst({
    where: { projectId: projA.id, action: 'CREATE', entityType: 'glossary', entityId: r.body.id },
  });
  assert.ok(audit, 'CREATE audit kaydi olmali');
});

test('glossary PUT: definition temizlenir + UPDATE audit yazilir', async () => {
  const created = await prisma.glossaryTerm.create({
    data: { projectId: projA.id, text_id: 'GLO-900', term: 'Onceki', definition: 'eski' },
  });
  const xss = '<b>vurgu</b><script>alert(2)</script>';
  const r = await request(app)
    .put(`/api/projects/${projA.id}/glossary/${created.id}`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ term: 'Yeni', definition: xss });
  assert.equal(r.status, 200);
  const row = await prisma.glossaryTerm.findUnique({ where: { id: created.id } });
  assert.ok(!row.definition.includes('<script>'), 'PUT ile gelen script temizlenmeli');
  assert.ok(row.definition.includes('<b>vurgu</b>'), 'beyaz listedeki etiket korunmali');
  const audit = await prisma.auditLog.findFirst({
    where: { projectId: projA.id, action: 'UPDATE', entityType: 'glossary', entityId: created.id },
  });
  assert.ok(audit, 'UPDATE audit kaydi olmali');
});

test('glossary DELETE: audit DELETE kaydi yazilir', async () => {
  const created = await prisma.glossaryTerm.create({
    data: { projectId: projA.id, text_id: 'GLO-901', term: 'Sil', definition: 'x' },
  });
  const r = await request(app)
    .delete(`/api/projects/${projA.id}/glossary/${created.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(r.status, 200);
  const audit = await prisma.auditLog.findFirst({
    where: { projectId: projA.id, action: 'DELETE', entityType: 'glossary', entityId: created.id },
  });
  assert.ok(audit, 'DELETE audit kaydi olmali');
});

// ============================================================================
//  Bug 4: server.js'deki ölü /import/reqif route kaldırıldı
//  Test: /import/reqif path traceability.js üzerinden çalışıyor (tek kaynak).
//  server.js'deki route kaldırıldığı için artık 404 beklenir.
//  traceability.js'deki route cleanRichText uygulamalı.
// ============================================================================

test('import/reqif: traceability.js uzerinden description temizlenir (cleanRichText)', async () => {
  const xss = '<p>guzel</p><script>alert(99)</script>';
  // Minik bir gecerli ReqIF XML'i
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <SPEC-TYPES>
        <SPEC-OBJECT-TYPE>
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="A1" LONG-NAME="Name"/>
            <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="A2" LONG-NAME="Desc"/>
          </SPEC-ATTRIBUTES>
        </SPEC-OBJECT-TYPE>
      </SPEC-TYPES>
      <SPEC-OBJECTS>
        <SPEC-OBJECT IDENTIFIER="O1" LONG-NAME="XSS deneme">
          <VALUES>
            <ATTRIBUTE-VALUE-STRING>
              <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>A1</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
              <THE-VALUE>XSS deneme</THE-VALUE>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-XHTML>
              <DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>A2</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
              <THE-VALUE>${xss}</THE-VALUE>
            </ATTRIBUTE-VALUE-XHTML>
          </VALUES>
        </SPEC-OBJECT>
      </SPEC-OBJECTS>
      <SPEC-RELATIONS/>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;
  const r = await request(app)
    .post(`/api/projects/${projA.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .send({ xmlContent: xml });
  assert.equal(r.status, 200, `200 olmali, gelen: ${r.status} ${JSON.stringify(r.body)}`);
  const rows = await prisma.requirement.findMany({
    where: { projectId: projA.id, author: 'reqif.import' },
  });
  assert.ok(rows.length >= 1, 'en az bir gereksinim import edilmeli');
  const desc = rows.map((r) => r.description).join(' | ');
  assert.ok(!desc.includes('<script>'), 'import edilen description temiz olmali (cleanRichText)');
  assert.ok(desc.includes('<p>guzel</p>'), 'beyaz listedeki etiket korunmali');
});

// ============================================================================
//  Bug 5: GET IDOR — /requirements/:id, /testcases/:id, /glossary/:id
// ============================================================================

test('GET /requirements/:id — baska projenin id ile 404 doner', async () => {
  const r = await request(app)
    .get(`/api/projects/${projA.id}/requirements/${reqB.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(r.status, 404, `404 olmali, gelen: ${r.status}`);
});

test('GET /testcases/:id — baska projenin id ile 404 doner', async () => {
  const tB = await prisma.testCase.create({
    data: {
      projectId: projB.id,
      text_id: 'TC-SYS-B01',
      title: 'B testi',
      type: 'System Test',
    },
  });
  const r = await request(app)
    .get(`/api/projects/${projA.id}/testcases/${tB.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(r.status, 404, `404 olmali, gelen: ${r.status}`);
});

test('GET /glossary/:id — baska projenin id ile 404 doner', async () => {
  const gB = await prisma.glossaryTerm.create({
    data: { projectId: projB.id, text_id: 'GLO-B01', term: 'B terim', definition: 'x' },
  });
  const r = await request(app)
    .get(`/api/projects/${projA.id}/glossary/${gB.id}`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(r.status, 404, `404 olmali, gelen: ${r.status}`);
});
